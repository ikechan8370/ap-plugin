import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/ai_painting/config.js'
import { ComfyUIClient } from '../components/ai_painting/comfyui.js'
import Log from '../utils/Log.js'

async function currentClient() {
  const config = await Config.getcfg()
  if (!config.APIList.length) return null
  return new ComfyUIClient(config.APIList[config.usingAPI - 1])
}

async function controlNetModels() {
  const client = await currentClient()
  return client ? client.models('controlnet').catch(() => []) : []
}

export class ControlNet extends plugin {
  constructor() {
    super({
      name: 'AP-控制网',
      dsc: 'ComfyUI ControlNet能力管理',
      event: 'message',
      priority: 1009,
      rule: [
        { reg: '^#?以图绘图(.*)$', fnc: 'controlNet' },
        { reg: '^#?预处理$', fnc: 'controlNetPreprocess' },
        { reg: '^#?控制网模型$', fnc: 'controlNetModelList' },
        { reg: '^#?控制网预处理器$', fnc: 'controlNetModuleList' },
        { reg: '^#?控制网设置模型(.*)$', fnc: 'controlNetSetModel' },
        { reg: '^#?控制网设置预处理器(.*)$', fnc: 'controlNetSetModule' },
      ],
    })
  }

  async unavailable(e) {
    const models = await controlNetModels()
    if (!models.length) {
      return e.reply('当前ComfyUI没有安装ControlNet模型。普通图生图请附带图片使用“#绘图 提示词”。', true)
    }
    return e.reply('已检测到ControlNet模型，但尚未配置对应的ComfyUI API工作流模板。', true)
  }

  async controlNet(e) {
    return this.unavailable(e)
  }

  async controlNetPreprocess(e) {
    return this.unavailable(e)
  }

  async controlNetModelList(e) {
    try {
      const models = await controlNetModels()
      return e.reply(models.length
        ? `当前ComfyUI ControlNet模型：\n${models.join('\n')}`
        : '当前ComfyUI没有安装ControlNet模型', true)
    } catch (error) {
      Log.e(error)
      return e.reply('获取ComfyUI ControlNet模型失败', true)
    }
  }

  async controlNetModuleList(e) {
    return this.unavailable(e)
  }

  async controlNetSetModel(e) {
    return this.unavailable(e)
  }

  async controlNetSetModule(e) {
    return this.unavailable(e)
  }
}
