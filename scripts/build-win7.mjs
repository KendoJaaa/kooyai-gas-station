import { spawn } from 'node:child_process'

// The project folder name contains ":", which breaks PATH lookup of
// node_modules/.bin. Invoke the tool entry files directly.
const env = { ...process.env, ELECTRON_MAJOR_VER: '22' }

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`${args.join(' ')} exited with code ${code}`))
    })
  })
}

console.log('Windows 7 build: Electron 22.3.27, Chrome 108, Node 16.17, x64 and ia32')

await run(['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.node.json', '--composite', 'false'])
await run(['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.web.json', '--composite', 'false'])
await run(['node_modules/electron-vite/bin/electron-vite.js', 'build'])
await run(['node_modules/electron-builder/cli.js', '--win', '--config', 'electron-builder.win7.yml'])
