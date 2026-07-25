import plugin from '../../../lib/plugins/plugin.js'
import Config from '../components/ai_painting/config.js'
import Log from '../utils/Log.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import {
  discover,
  listModels,
  listVaes,
} from '../components/ai_painting/comfyui.js'

const _path = process.cwd()

async function current() {
  const config = await Config.getcfg()
  if (!config.APIList.length) return { config, apiobj: null }
  return { config, apiobj: config.APIList[config.usingAPI - 1] }
}

function selectByInput(input, values) {
  const value = String(input || '').trim()
  if (!value) return { error: '名称不能为空' }
  if (/^\d+$/.test(value)) {
    const index = Number(value) - 1
    return values[index] ? { value: values[index] } : { error: '序号不存在' }
  }
  const matches = values.filter((item) => item.toLowerCase().startsWith(value.toLowerCase()))
  if (!matches.length) return { error: '不存在' }
  if (matches.length > 1) return { error: '名称不唯一' }
  return { value: matches[0] }
}

export class ChangeModel extends plugin {
  constructor() {
    super({
      name: 'AP-模型切换',
      dsc: 'ComfyUI模型切换',
      event: 'message',
      priority: 1009,
      rule: [
        { reg: '^#?模型列表$', fnc: 'modelList' },
        { reg: '^#?切换模型(.*)$', fnc: 'changeModel', permission: 'master' },
        { reg: '^#?(VAE|vae|Vae)列表$', fnc: 'VAEList' },
        { reg: '^#?切换(VAE|vae|Vae)(.*)$', fnc: 'changeVAE', permission: 'master' },
        { reg: '^#?刷新模型$', fnc: 'refreshModel', permission: 'master' },
      ],
    })
  }

  async renderList(e, sidebar, listName, models, apiobj, notice) {
    const base64 = await puppeteer.screenshot('ap-plugin', {
      saveId: 'swichModel',
      tplFile: `${_path}/plugins/ap-plugin/resources/listTemp/listTemp.html`,
      sidebar,
      list_name: listName,
      _path,
      imgType: 'png',
      header: apiobj.remark,
      models,
      list1: `${listName}名称`,
      list2: '文件类型',
      notice,
    })
    await e.reply(base64)
    return true
  }

  async modelList(e) {
    const { apiobj } = await current()
    if (!apiobj) return e.reply('当前无可用ComfyUI接口')
    const models = (await listModels(apiobj)).map((item) => ({
      list1: item.title,
      list2: item.title.split('.').pop(),
      able: item.title === apiobj.model,
    }))
    return this.renderList(
      e,
      '模型列表',
      '扩散模型',
      models,
      apiobj,
      '使用#切换模型+名称或序号，切换仅影响当前AP接口',
    )
  }

  async VAEList(e) {
    const { apiobj } = await current()
    if (!apiobj) return e.reply('当前无可用ComfyUI接口')
    const models = (await listVaes(apiobj)).map((item) => ({
      list1: item.model_name,
      list2: item.model_name.split('.').pop(),
      able: item.model_name === apiobj.vae,
    }))
    return this.renderList(
      e,
      'VAE列表',
      'VAE',
      models,
      apiobj,
      '使用#切换VAE+名称或序号，切换仅影响当前AP接口',
    )
  }

  async changeModel(e) {
    const { config, apiobj } = await current()
    if (!apiobj) return e.reply('当前无可用ComfyUI接口')
    const values = (await listModels(apiobj)).map((item) => item.title)
    const selected = selectByInput(e.msg.replace(/^#?切换模型/, ''), values)
    if (selected.error) return e.reply(`模型${selected.error}`, true)
    apiobj.model = selected.value
    await Config.setcfg(config)
    Log.i(`ComfyUI模型已切换为 ${selected.value}`)
    return e.reply(`模型切换成功：${selected.value}`, true)
  }

  async changeVAE(e) {
    const { config, apiobj } = await current()
    if (!apiobj) return e.reply('当前无可用ComfyUI接口')
    const values = (await listVaes(apiobj)).map((item) => item.model_name)
    const selected = selectByInput(
      e.msg.replace(/^#?切换(VAE|vae|Vae)/, ''),
      values,
    )
    if (selected.error) return e.reply(`VAE${selected.error}`, true)
    apiobj.vae = selected.value
    await Config.setcfg(config)
    Log.i(`ComfyUI VAE已切换为 ${selected.value}`)
    return e.reply(`VAE切换成功：${selected.value}`, true)
  }

  async refreshModel(e) {
    const { apiobj } = await current()
    if (!apiobj) return e.reply('当前无可用ComfyUI接口')
    try {
      await discover(apiobj, true)
      return e.reply('ComfyUI模型列表刷新成功', true)
    } catch (error) {
      Log.e(error)
      return e.reply(`模型列表刷新失败：${error.message}`, true)
    }
  }
}
