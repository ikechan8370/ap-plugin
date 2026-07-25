import { randomUUID } from "node:crypto";
import fetch from "node-fetch";
import { File, FormData } from "formdata-node";

const discoveryCache = new Map();
const DEFAULT_TIMEOUT = 15 * 60 * 1000;

const SAMPLER_ALIASES = {
  "Euler": ["euler", "simple"],
  "Euler a": ["euler_ancestral", "simple"],
  "DPM++ 2M": ["dpmpp_2m", "simple"],
  "DPM++ 2M Karras": ["dpmpp_2m", "karras"],
  "DPM++ SDE": ["dpmpp_sde", "simple"],
  "DPM++ SDE Karras": ["dpmpp_sde", "karras"],
  "DPM++ 2M SDE": ["dpmpp_2m_sde", "simple"],
  "DPM++ 2M SDE Karras": ["dpmpp_2m_sde", "karras"],
  "DPM2": ["dpm_2", "simple"],
  "DPM2 a": ["dpm_2_ancestral", "simple"],
  "LMS": ["lms", "simple"],
  "Heun": ["heun", "simple"],
  "DDIM": ["ddim", "simple"],
  "UniPC": ["uni_pc", "simple"],
};

function normalizeUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function authHeaders(apiobj, json = false) {
  const headers = {};
  if (json) {
    headers.Accept = "application/json";
    headers["Content-Type"] = "application/json";
  }
  if (apiobj?.account_id && apiobj?.account_password) {
    headers.Authorization = `Basic ${Buffer.from(
      `${apiobj.account_id}:${apiobj.account_password}`,
      "utf8",
    ).toString("base64")}`;
  }
  return headers;
}

async function parseError(response) {
  let detail = response.statusText;
  try {
    const body = await response.text();
    if (body) detail = body;
  } catch {}
  const error = new Error(`ComfyUI ${response.status}: ${detail}`);
  error.status = response.status;
  return error;
}

export class ComfyUIClient {
  constructor(apiobj) {
    this.apiobj = apiobj;
    this.url = normalizeUrl(apiobj.url);
    this.clientId = randomUUID();
  }

  async json(path, options = {}) {
    const response = await fetch(`${this.url}${path}`, {
      ...options,
      headers: {
        ...authHeaders(this.apiobj, true),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw await parseError(response);
    return response.json();
  }

  async systemStats() {
    return this.json("/system_stats");
  }

  async objectInfo(node = "") {
    return this.json(`/object_info${node ? `/${encodeURIComponent(node)}` : ""}`);
  }

  async models(type) {
    return this.json(`/models/${encodeURIComponent(type)}`);
  }

  async uploadImage(base64) {
    const buffer = Buffer.from(
      String(base64).replace(/^data:image\/[^;]+;base64,/, ""),
      "base64",
    );
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const extension = isJpeg ? "jpg" : "png";
    const mime = isJpeg ? "image/jpeg" : "image/png";
    const filename = `ap-plugin-${randomUUID()}.${extension}`;
    const form = new FormData();
    form.set("image", new File([buffer], filename, { type: mime }));
    form.set("type", "input");
    form.set("overwrite", "true");

    const response = await fetch(`${this.url}/upload/image`, {
      method: "POST",
      headers: authHeaders(this.apiobj),
      body: form,
    });
    if (!response.ok) throw await parseError(response);
    const result = await response.json();
    return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
  }

  async queuePrompt(prompt) {
    return this.json("/prompt", {
      method: "POST",
      body: JSON.stringify({ prompt, client_id: this.clientId }),
    });
  }

  async history(promptId) {
    return this.json(`/history/${encodeURIComponent(promptId)}`);
  }

  async waitForResult(promptId, timeout = DEFAULT_TIMEOUT) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const history = await this.history(promptId);
      const item = history[promptId];
      if (item) {
        const status = item.status;
        if (status?.status_str === "error" || status?.completed === false) {
          const messages = status?.messages || [];
          throw new Error(`ComfyUI 工作流执行失败: ${JSON.stringify(messages)}`);
        }
        if (item.outputs && Object.keys(item.outputs).length) return item;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    const error = new Error(`ComfyUI 生成超时（${Math.round(timeout / 1000)} 秒）`);
    error.code = "ETIMEDOUT";
    throw error;
  }

  async downloadImage(image) {
    const query = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder || "",
      type: image.type || "output",
    });
    const response = await fetch(`${this.url}/view?${query}`, {
      headers: authHeaders(this.apiobj),
    });
    if (!response.ok) throw await parseError(response);
    return Buffer.from(await response.arrayBuffer());
  }

  async queue() {
    return this.json("/queue");
  }

  async interrupt() {
    return this.json("/interrupt", {
      method: "POST",
      body: "{}",
    });
  }
}

function inputChoices(objectInfo, node, input) {
  const value = objectInfo?.[node]?.input?.required?.[input]?.[0];
  return Array.isArray(value) ? value : [];
}

export async function discover(apiobj, force = false) {
  const key = normalizeUrl(apiobj.url);
  const cached = discoveryCache.get(key);
  if (!force && cached && Date.now() - cached.time < 60_000) return cached.value;

  const client = new ComfyUIClient(apiobj);
  const [system, unet, clip, vae, sampler, lora] = await Promise.all([
    client.systemStats(),
    client.objectInfo("UNETLoader"),
    client.objectInfo("CLIPLoader"),
    client.objectInfo("VAELoader"),
    client.objectInfo("KSampler"),
    client.objectInfo("LoraLoaderModelOnly").catch(() => ({})),
  ]);
  const value = {
    system,
    models: inputChoices(unet, "UNETLoader", "unet_name"),
    clips: inputChoices(clip, "CLIPLoader", "clip_name"),
    clipTypes: inputChoices(clip, "CLIPLoader", "type"),
    vaes: inputChoices(vae, "VAELoader", "vae_name"),
    samplers: inputChoices(sampler, "KSampler", "sampler_name"),
    schedulers: inputChoices(sampler, "KSampler", "scheduler"),
    loras: inputChoices(lora, "LoraLoaderModelOnly", "lora_name"),
  };
  discoveryCache.set(key, { time: Date.now(), value });
  return value;
}

function choose(configured, choices, fallback = "") {
  if (configured && choices.includes(configured)) return configured;
  return choices[0] || configured || fallback;
}

function normalizeSampler(name, info, configuredScheduler) {
  let sampler = name;
  let scheduler = configuredScheduler;
  if (SAMPLER_ALIASES[name]) {
    [sampler, scheduler] = SAMPLER_ALIASES[name];
  }
  if (!info.samplers.includes(sampler)) sampler = info.samplers.includes("euler") ? "euler" : info.samplers[0];
  if (!info.schedulers.includes(scheduler)) {
    scheduler = info.schedulers.includes("simple") ? "simple" : info.schedulers[0];
  }
  return { sampler, scheduler };
}

function extractLoras(prompt, available) {
  const loras = [];
  const text = String(prompt || "").replace(
    /<lora:([^:>]+)(?::(-?\d+(?:\.\d+)?))?>/gi,
    (_, rawName, rawWeight) => {
      const name = available.find(
        (item) =>
          item === rawName ||
          item.replace(/\.safetensors$/i, "") === rawName.replace(/\.safetensors$/i, ""),
      );
      if (name) {
        loras.push({
          name,
          weight: Number.isFinite(Number(rawWeight)) ? Number(rawWeight) : 0.8,
        });
      }
      return "";
    },
  );
  return { text: text.replace(/\s*,\s*,/g, ",").trim(), loras };
}

function addModelLoras(workflow, modelNode, loras) {
  let previous = modelNode;
  let nextId = 20;
  for (const lora of loras) {
    const id = String(nextId++);
    workflow[id] = {
      class_type: "LoraLoaderModelOnly",
      inputs: {
        model: [previous, 0],
        lora_name: lora.name,
        strength_model: lora.weight,
      },
      _meta: { title: `AP LoRA: ${lora.name}` },
    };
    previous = id;
  }
  return previous;
}

function commonWorkflow(payload, apiobj, info) {
  const model = choose(apiobj.model, info.models);
  const clip = choose(apiobj.clip, info.clips);
  const vae = choose(apiobj.vae, info.vaes);
  const clipType = choose(apiobj.clip_type || "krea2", info.clipTypes, "krea2");
  if (!model || !clip || !vae) {
    throw new Error("ComfyUI 缺少 UNet、CLIP 或 VAE 模型，无法构建工作流");
  }

  const positive = extractLoras(payload.prompt, info.loras);
  const negative = extractLoras(payload.negative_prompt, info.loras);
  const workflow = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: model, weight_dtype: apiobj.weight_dtype || "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: clip, type: clipType, device: "default" },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: vae } },
    "4": { class_type: "CLIPTextEncode", inputs: { text: positive.text, clip: ["2", 0] } },
    "5": { class_type: "CLIPTextEncode", inputs: { text: negative.text, clip: ["2", 0] } },
  };
  const loraModelNode = addModelLoras(workflow, "1", [...positive.loras, ...negative.loras]);
  return { workflow, loraModelNode, positive: positive.text, negative: negative.text };
}

async function buildWorkflow(payload, apiobj, info, client) {
  const { workflow, loraModelNode, positive, negative } = commonWorkflow(payload, apiobj, info);
  const { sampler, scheduler } = normalizeSampler(
    payload.sampler_index || payload.sampler_name || "euler",
    info,
    apiobj.scheduler || "simple",
  );
  const seed = Number(payload.seed) >= 0
    ? Number(payload.seed)
    : Math.floor(Math.random() * 2147483647);
  const img2img = Array.isArray(payload.init_images) && payload.init_images.length > 0;
  let latentNode;

  if (img2img) {
    const imageName = await client.uploadImage(payload.init_images[0]);
    workflow["10"] = { class_type: "LoadImage", inputs: { image: imageName } };
    workflow["11"] = {
      class_type: "ImageScaleToTotalPixels",
      inputs: {
        image: ["10", 0],
        upscale_method: "lanczos",
        megapixels: Math.max(0.1, (Number(payload.width) * Number(payload.height)) / 1_000_000),
        resolution_steps: 32,
      },
    };
    workflow["12"] = {
      class_type: "VAEEncode",
      inputs: { pixels: ["11", 0], vae: ["3", 0] },
    };
    latentNode = "12";
  } else {
    workflow["6"] = {
      class_type: "EmptySD3LatentImage",
      inputs: {
        width: Math.max(16, Math.round(Number(payload.width) / 16) * 16),
        height: Math.max(16, Math.round(Number(payload.height) / 16) * 16),
        batch_size: 1,
      },
    };
    latentNode = "6";
  }

  workflow["7"] = {
    class_type: "KSampler",
    inputs: {
      seed,
      steps: Math.max(1, Math.round(Number(payload.steps) || 8)),
      cfg: Number(payload.cfg_scale) || 1,
      sampler_name: sampler,
      scheduler,
      denoise: img2img ? Number(payload.denoising_strength) || 0.5 : 1,
      model: [loraModelNode, 0],
      positive: ["4", 0],
      negative: ["5", 0],
      latent_image: [latentNode, 0],
    },
  };
  workflow["8"] = {
    class_type: "VAEDecodeTiled",
    inputs: {
      samples: ["7", 0],
      vae: ["3", 0],
      tile_size: Number(apiobj.vae_tile_size) || 512,
      overlap: 64,
      temporal_size: 64,
      temporal_overlap: 8,
    },
  };
  workflow["9"] = {
    class_type: "SaveImage",
    inputs: { images: ["8", 0], filename_prefix: "AP-Plugin/ComfyUI" },
  };

  return {
    workflow,
    parameters: {
      ...payload,
      seed,
      prompt: positive,
      negative_prompt: negative,
      sampler_index: sampler,
      sampler_name: sampler,
      scheduler,
    },
  };
}

export async function generate(payload, apiobj) {
  const client = new ComfyUIClient(apiobj);
  const info = await discover(apiobj);
  const { workflow, parameters } = await buildWorkflow(payload, apiobj, info, client);
  const queued = await client.queuePrompt(workflow);
  if (!queued.prompt_id) {
    throw new Error(`ComfyUI 未返回 prompt_id: ${JSON.stringify(queued)}`);
  }
  const history = await client.waitForResult(
    queued.prompt_id,
    Number(apiobj.timeout) || DEFAULT_TIMEOUT,
  );
  const images = [];
  for (const output of Object.values(history.outputs || {})) {
    for (const image of output.images || []) {
      images.push((await client.downloadImage(image)).toString("base64"));
    }
  }
  if (!images.length) throw new Error("ComfyUI 工作流完成，但没有返回图片");

  return {
    status: 200,
    statusText: "OK",
    async json() {
      return { images, parameters, info: JSON.stringify({ prompt_id: queued.prompt_id }) };
    },
  };
}

export async function upscaleImage(base64, scale, apiobj) {
  const client = new ComfyUIClient(apiobj);
  const imageName = await client.uploadImage(base64);
  const workflow = {
    "1": { class_type: "LoadImage", inputs: { image: imageName } },
    "2": {
      class_type: "ImageScaleBy",
      inputs: {
        image: ["1", 0],
        upscale_method: "lanczos",
        scale_by: Math.max(0.01, Number(scale) || 2),
      },
    },
    "3": {
      class_type: "SaveImage",
      inputs: { images: ["2", 0], filename_prefix: "AP-Plugin/Upscale" },
    },
  };
  const queued = await client.queuePrompt(workflow);
  const history = await client.waitForResult(queued.prompt_id, Number(apiobj.timeout) || DEFAULT_TIMEOUT);
  const image = Object.values(history.outputs || {}).flatMap((output) => output.images || [])[0];
  if (!image) throw new Error("ComfyUI 放大工作流没有返回图片");
  return (await client.downloadImage(image)).toString("base64");
}

export async function testConnection(apiobj) {
  const info = await discover(apiobj, true);
  return Boolean(info.system?.system?.comfyui_version);
}

export async function listSamplers(apiobj) {
  const info = await discover(apiobj);
  return info.samplers.map((name) => ({ name, aliases: [], options: {} }));
}

export async function listModels(apiobj) {
  const info = await discover(apiobj);
  return info.models.map((name) => ({
    title: name,
    model_name: name.replace(/\.[^.]+$/, ""),
    name,
    hash: "",
    sha256: "",
    filename: name,
  }));
}

export async function listVaes(apiobj) {
  const info = await discover(apiobj);
  return info.vaes.map((name) => ({ model_name: name, filename: name }));
}

export async function listLoras(apiobj) {
  const info = await discover(apiobj);
  return info.loras.map((name) => ({
    name,
    alias: name.replace(/^.*[\\/]/, "").replace(/\.safetensors$/i, ""),
    path: name,
  }));
}

export async function listUpscalers(apiobj) {
  const client = new ComfyUIClient(apiobj);
  const names = await client.models("upscale_models").catch(() => []);
  return names.map((name) => ({ name, model_name: name, model_path: name }));
}

export async function listEmbeddings(apiobj) {
  const client = new ComfyUIClient(apiobj);
  const names = await client.models("embeddings").catch(() => []);
  return names.map((name) => ({ name, model_name: name }));
}

export async function queueStatus(apiobj) {
  const client = new ComfyUIClient(apiobj);
  const queue = await client.queue();
  return {
    running: queue.queue_running?.length || 0,
    pending: queue.queue_pending?.length || 0,
  };
}

export async function interrupt(apiobj) {
  return new ComfyUIClient(apiobj).interrupt();
}

function pngTextChunks(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    return {};
  }
  const values = {};
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "tEXt") {
      const zero = data.indexOf(0);
      if (zero > 0) values[data.toString("latin1", 0, zero)] = data.toString("utf8", zero + 1);
    } else if (type === "iTXt") {
      const zero = data.indexOf(0);
      if (zero > 0 && data[zero + 1] === 0) {
        let cursor = zero + 3;
        cursor = data.indexOf(0, cursor) + 1;
        cursor = data.indexOf(0, cursor) + 1;
        if (cursor > 1) values[data.toString("utf8", 0, zero)] = data.toString("utf8", cursor);
      }
    }
    offset = dataEnd + 4;
    if (type === "IEND") break;
  }
  return values;
}

export function readComfyPngInfo(buffer) {
  const chunks = pngTextChunks(buffer);
  if (!chunks.prompt) return "";
  try {
    const prompt = JSON.parse(chunks.prompt);
    const samplerEntry = Object.entries(prompt).find(([, node]) => node.class_type === "KSampler");
    if (!samplerEntry) return JSON.stringify(prompt, null, 2);
    const sampler = samplerEntry[1];
    const positive = prompt[sampler.inputs.positive?.[0]]?.inputs?.text || "";
    const negative = prompt[sampler.inputs.negative?.[0]]?.inputs?.text || "";
    const latent = Object.values(prompt).find((node) =>
      ["EmptyLatentImage", "EmptySD3LatentImage"].includes(node.class_type),
    );
    return [
      `Positive prompt: ${positive}`,
      `Negative prompt: ${negative}`,
      `Steps: ${sampler.inputs.steps}`,
      `Sampler: ${sampler.inputs.sampler_name}`,
      `Scheduler: ${sampler.inputs.scheduler}`,
      `CFG scale: ${sampler.inputs.cfg}`,
      `Seed: ${sampler.inputs.seed}`,
      latent ? `Size: ${latent.inputs.width}x${latent.inputs.height}` : "",
      "Backend: ComfyUI",
    ].filter(Boolean).join("\n");
  } catch {
    return chunks.prompt;
  }
}
