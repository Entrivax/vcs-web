import fs = require('fs/promises')

export async function loadConfig<T>(path: string, defaultConfig: T): Promise<T> {
    return Object.assign({}, defaultConfig, await(async () => {
        try {
            return JSON.parse(await fs.readFile(path, { encoding: 'utf8' }))
        } catch (err) {
            return {}
        }
    })())
}