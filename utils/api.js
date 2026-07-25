import Log from "./Log.js";
import Config from "../components/ai_painting/config.js";
import {
    listEmbeddings,
    listLoras,
    listModels,
    listUpscalers,
    listVaes,
} from "../components/ai_painting/comfyui.js";

async function currentApi() {
    const config = await Config.getcfg();
    if (!config.APIList.length) return null;
    return config.APIList[config.usingAPI - 1];
}

async function fetchData(loader, errorMessage) {
    try {
        const apiobj = await currentApi();
        if (!apiobj) return false;
        return await loader(apiobj);
    } catch (error) {
        Log.e(`获取${errorMessage}失败: ${error.message}`);
        return false;
    }
}

export async function upscalers() {
    return fetchData(listUpscalers, "放大器列表");
}

export async function latent_upscalers() {
    return [];
}

export async function sd_models() {
    return fetchData(listModels, "模型列表");
}

export async function sd_vae() {
    return fetchData(listVaes, "变分自编码器列表");
}

export async function hypernetworks() {
    return [];
}

export async function face_restorers() {
    return [];
}

export async function realesrgan_models() {
    return fetchData(listUpscalers, "超分模型列表");
}

export async function embeddings() {
    return fetchData(listEmbeddings, "嵌入模型列表");
}

export async function loras() {
    return fetchData(listLoras, "LoRA列表");
}
