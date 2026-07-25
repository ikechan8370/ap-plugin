import plugin from "../../../lib/plugins/plugin.js";
import fs from "fs";
import YAML from "yaml";
import cfg from "../../../lib/config/config.js";
import Config from '../components/ai_painting/config.js';
import Log from '../utils/Log.js';
import {
  listSamplers,
  listUpscalers,
} from "../components/ai_painting/comfyui.js";

const parsePath = process.cwd() + "\/plugins\/ap-plugin\/config\/config\/parse.yaml";

export class set_parse extends plugin {
  constructor() {
    super({
      name: "AP-设置默认参数",
      event: "message",
      priority: 1009,
      rule: [
        {
          reg: "^#ap设置(全局)?(默认)?(采样方法|迭代次数|宽度|高度|提示词相关性|重绘幅度|高清修复|放大算法|高清修复步数|高清修复重绘幅度|高清修复放大倍数).*",
          fnc: "set_parse",
        },
        {
          reg: "^#ap查看(全局)?(默认)?参数$",
          fnc: "get_parse",
        }
      ],
    });
  }

  async set_parse(e) {
    const samplerList = await getSamplers();
    const upscalerList = await getUpscalers();
    initialization(e);
    let parseData = YAML.parse(fs.readFileSync(parsePath, "utf8"));
    if (!parseData[e.user_id]) {
      parseData[e.user_id] = {};
    }
    // 可设置的参数有【采样方法】【迭代次数】【宽度】【高度】【提示词相关性】【重绘幅度】【高清修复】【放大算法】【高清修复步数】【高清修复重绘幅度】【高清修复放大倍数】
    if (e.msg.match(/采样方法/)) {
      // 采样方法，需要判断是否在列表中
      if (samplerList.indexOf(e.msg.match(/采样方法(.*)/)[1]) == -1) {
        e.reply("采样方法【" + e.msg.match(/采样方法(.*)/)[1] + "】不在列表中，可用的采样方法有：\n" + samplerList.join(`\n`) + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].sampler = e.msg.match(/采样方法(.*)/)[1];
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].sampler = e.msg.match(/采样方法(.*)/)[1];
      }
    } else if (e.msg.match(/迭代次数/)) {
      // 迭代次数，1-150整数
      if (e.msg.match(/迭代次数(.*)/)[1] < 1 || e.msg.match(/迭代次数(.*)/)[1] > 150 || !Number.isInteger(Number(e.msg.match(/迭代次数(.*)/)[1]))) {
        e.reply("迭代次数【" + e.msg.match(/迭代次数(.*)/)[1] + "】不在正确的范围内(1~150)，或不是整数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].steps = Number(e.msg.match(/迭代次数(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].steps = Number(e.msg.match(/迭代次数(.*)/)[1]);
      }
    } else if (e.msg.match(/宽度/)) {
      // 宽度，1-2048，8的倍数，计算时需要消除浮点误差
      if (e.msg.match(/宽度(.*)/)[1] < 1 || e.msg.match(/宽度(.*)/)[1] > 2048 || !Number.isInteger(Number(e.msg.match(/宽度(.*)/)[1])) || (e.msg.match(/宽度(.*)/)[1] % 8).toFixed(0) != 0) {
        e.reply("宽度【" + e.msg.match(/宽度(.*)/)[1] + "】不在正确的范围内(1~2048)，或不是整数，或不是8的倍数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].width = Number(e.msg.match(/宽度(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].width = Number(e.msg.match(/宽度(.*)/)[1]);
      }
    } else if (e.msg.match(/高度/)) {
      // 高度，1-2048，8的倍数
      if (e.msg.match(/高度(.*)/)[1] < 1 || e.msg.match(/高度(.*)/)[1] > 2048 || !Number.isInteger(Number(e.msg.match(/高度(.*)/)[1])) || (e.msg.match(/高度(.*)/)[1] % 8).toFixed(0) != 0) {
        e.reply("高度【" + e.msg.match(/高度(.*)/)[1] + "】不在正确的范围内(1~2048)，或不是整数，或不是8的倍数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].height = Number(e.msg.match(/高度(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].height = Number(e.msg.match(/高度(.*)/)[1]);
      }
    } else if (e.msg.match(/提示词相关性/)) {
      // 提示词相关性，1-30，最小值差值0.5
      if (e.msg.match(/提示词相关性(.*)/)[1] < 1 || e.msg.match(/提示词相关性(.*)/)[1] > 30 || (e.msg.match(/提示词相关性(.*)/)[1] % 0.5).toFixed(0) != 0) {
        e.reply("提示词相关性【" + e.msg.match(/提示词相关性(.*)/)[1] + "】不在正确的范围内(0~30)，或不是0.5的倍数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].scale = Number(e.msg.match(/提示词相关性(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].scale = Number(e.msg.match(/提示词相关性(.*)/)[1]);
      }
    } else if (e.msg.match(/重绘幅度/)) {
      // 重绘幅度，0-1，最小差值0.01
      if (e.msg.match(/重绘幅度(.*)/)[1] < 0 || e.msg.match(/重绘幅度(.*)/)[1] > 1 || (e.msg.match(/重绘幅度(.*)/)[1] % 0.01).toFixed(0) != 0) {
        e.reply("重绘幅度【" + e.msg.match(/重绘幅度(.*)/)[1] + "】不在正确的范围内(0~1)，或不是0.01的倍数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].strength = Number(e.msg.match(/重绘幅度(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].strength = Number(e.msg.match(/重绘幅度(.*)/)[1]);
      }
    } else if (e.msg.match(/放大算法/)) {
      // 放大算法，需要判断是否在列表中
      if (upscalerList.indexOf(e.msg.match(/放大算法(.*)/)[1]) == -1) {
        e.reply("放大算法【" + e.msg.match(/放大算法(.*)/)[1] + "】不在列表中，可用的放大算法有：" + upscalerList.join("\n") + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].hr_upscaler = e.msg.match(/放大算法(.*)/)[1];
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].hr_upscaler = e.msg.match(/放大算法(.*)/)[1];
      }
    } else if (e.msg.match(/高清修复步数/)) {
      // 高清修复步数，0-150整数
      if (e.msg.match(/高清修复步数(.*)/)[1] < 0 || e.msg.match(/高清修复步数(.*)/)[1] > 150 || !Number.isInteger(Number(e.msg.match(/高清修复步数(.*)/)[1]))) {
        e.reply("高清修复步数【" + e.msg.match(/高清修复步数(.*)/)[1] + "】不在正确的范围内(0~150)，或不是整数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].hr_second_pass_steps = Number(e.msg.match(/高清修复步数(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].hr_second_pass_steps = Number(e.msg.match(/高清修复步数(.*)/)[1]);
      }
    } else if (e.msg.match(/高清修复重绘幅度/)) {
      // 高清修复重绘幅度，0-1，最小差值0.01
      if (e.msg.match(/高清修复重绘幅度(.*)/)[1] < 0 || e.msg.match(/高清修复重绘幅度(.*)/)[1] > 1 || (e.msg.match(/高清修复重绘幅度(.*)/)[1] % 0.01).toFixed(0) != 0) {
        e.reply("高清修复重绘幅度【" + e.msg.match(/高清修复重绘幅度(.*)/)[1] + "】不在正确的范围内(0~1)，或不是0.01的倍数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].hr_second_pass_strength = Number(e.msg.match(/高清修复重绘幅度(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].strength = Number(e.msg.match(/高清修复重绘幅度(.*)/)[1]);
      }
    } else if (e.msg.match(/高清修复放大倍数/)) {
      // 高清修复放大倍数，0-4，最小差值0.25
      if (e.msg.match(/高清修复放大倍数(.*)/)[1] < 0 || e.msg.match(/高清修复放大倍数(.*)/)[1] > 4 || (e.msg.match(/高清修复放大倍数(.*)/)[1] % 0.25).toFixed(0) != 0) {
        e.reply("高清修复放大倍数【" + e.msg.match(/高清修复放大倍数(.*)/)[1] + "】不在正确的范围内(0~4)，或不是0.25的倍数" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].hr_scale = Number(e.msg.match(/高清修复放大倍数(.*)/)[1]);
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].hr_scale = Number(e.msg.match(/高清修复放大倍数(.*)/)[1]);
      }
    } else if (e.msg.match(/高清修复/)) {
      // 高清修复，结果为开启则为true，关闭则为false
      if (e.msg.match(/高清修复(.*)/)[1] != "开启" && e.msg.match(/高清修复(.*)/)[1] != "关闭") {
        e.reply("高清修复【" + e.msg.match(/高清修复(.*)/)[1] + "】不在正确的范围内(开启/关闭)" + "\n请重新输入", true);
        return true;
      }
      if (e.msg.match(/全局/)) {
        if (cfg.masterQQ.includes(e.user_id)) {
          parseData["default"].enable_hr = e.msg.match(/高清修复(.*)/)[1] == "开启" ? true : false;
        } else {
          e.reply("您没有权限设置全局默认参数", true);
          return true;
        }
      } else {
        parseData[e.user_id].enable_hr = e.msg.match(/高清修复(.*)/)[1] == "开启" ? true : false;
      }
    } else {
      e.reply("【" + e.msg.replace(/#ap设置默认/, "") + "】为未知参数，可设置的参数有：【采样方法】【迭代次数】【宽度】【高度】【提示词相关性】【重绘幅度】【高清修复】【放大算法】【高清修复步数】【高清修复重绘幅度】【高清修复放大倍数】");
      return true;
    }
    fs.writeFileSync(parsePath, YAML.stringify(parseData));
    e.reply("设置成功");
    return true;
  }
  async get_parse(e) {
    initialization(e);
    let parseData = YAML.parse(fs.readFileSync(parsePath, "utf8"));
    let parseDataUser;
    let msg = "";
    if (e.msg.match(/全局/)) {
      if (cfg.masterQQ.includes(e.user_id)) {
        parseDataUser = parseData["default"];
      } else {
        e.reply("您没有权限查看全局默认参数", true);
        return true;
      }
    } else {
      parseDataUser = parseData[e.user_id];
      msg = `${ e.nickname || e.member.nickname }当前设置：\n`;
    }
    msg += "【采样方法】：" + parseDataUser.sampler + "\n";
    msg += "【迭代次数】：" + parseDataUser.steps + "\n";
    msg += "【宽度】：" + parseDataUser.width + "\n";
    msg += "【高度】：" + parseDataUser.height + "\n";
    msg += "【提示词相关性】：" + parseDataUser.scale + "\n";
    msg += "【(高清修复)重绘幅度】：" + parseDataUser.strength + "\n";
    msg += "【高清修复】：" + (parseDataUser.enable_hr ? "开启" : "关闭") + "\n";
    msg += "【放大算法】：" + parseDataUser.hr_upscaler + "\n";
    msg += "【高清修复步数】：" + parseDataUser.hr_second_pass_steps + "\n";
    msg += "【高清修复放大倍数】：" + parseDataUser.hr_scale
    e.reply(msg);
  }
}

async function initialization(e) {
  // 判断是否有用户数据，没有则创建
  let parseData = YAML.parse(fs.readFileSync(parsePath, "utf8"));
  let defaultData = parseData["default"];
  if (!parseData[e.user_id]) {
    parseData[e.user_id] = {
      sampler: defaultData.sampler,
      steps: defaultData.steps,
      width: defaultData.width,
      height: defaultData.height,
      scale: defaultData.scale,
      strength: defaultData.strength,
      enable_hr: defaultData.enable_hr,
      hr_upscaler: defaultData.hr_upscaler,
      hr_second_pass_steps: defaultData.hr_second_pass_steps,
      hr_scale: defaultData.hr_scale
    };
  }
  fs.writeFileSync(parsePath, YAML.stringify(parseData));
}

async function getSamplers() {
  try {
    const config = await Config.getcfg()
    const apiobj = config.APIList[config.usingAPI - 1]
    return (await listSamplers(apiobj)).map((item) => item.name)
  } catch (err) {
    Log.w("获取ComfyUI采样器列表失败", err)
    return ['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde']
  }
}

async function getUpscalers() {
  try {
    const config = await Config.getcfg()
    const apiobj = config.APIList[config.usingAPI - 1]
    const names = (await listUpscalers(apiobj)).map((item) => item.name)
    return names.length ? names : ['Lanczos']
  } catch (err) {
    Log.w("获取ComfyUI放大模型列表失败", err)
    return ['Lanczos']
  }
}
