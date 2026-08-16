import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { jsPDF } from 'jspdf'

const root = process.cwd()
const outputDirectory = path.join(root, 'docs', 'prototypes')
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const serverPort = 4173
const screens = [
  ['dashboard', '01-dashboard.png'],
  ['project-detail', '02-project-detail.png'],
  ['meeting-import', '03-meeting-import.png'],
  ['ai-review', '04-ai-review.png'],
  ['task-board', '05-task-board.png'],
  ['risk-center', '06-risk-center.png'],
  ['my-tasks', '07-my-tasks.png'],
  ['task-feedback', '08-task-feedback.png'],
  ['settings', '09-settings.png'],
  ['audit-log', '10-audit-log.png'],
] as const

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)))
  })
}

async function waitForServer() {
  const target = `http://127.0.0.1:${serverPort}/prototype/index.html?screen=dashboard`
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Prototype server did not start at ${target}`)
}

async function capture(url: string, outputPath: string) {
  await run(chromePath, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--force-device-scale-factor=1', '--window-size=1440,900', '--virtual-time-budget=1200',
    '--run-all-compositor-stages-before-draw', `--screenshot=${outputPath}`, url,
  ])
}

async function captureScreen(screen: string, fileName: string) {
  await capture(`http://127.0.0.1:${serverPort}/prototype/index.html?screen=${screen}`, path.join(outputDirectory, fileName))
}

async function buildPdf() {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1440, 900], hotfixes: ['px_scaling'], compress: true })
  const coverPath = path.join(outputDirectory, '.pdf-cover.png')
  try {
    await capture(`http://127.0.0.1:${serverPort}/prototype/cover.html`, coverPath)
    const cover = await readFile(coverPath)
    pdf.addImage(`data:image/png;base64,${cover.toString('base64')}`, 'PNG', 0, 0, 1440, 900, undefined, 'FAST')
    for (const [, fileName] of screens) {
      pdf.addPage([1440, 900], 'landscape')
      const png = await readFile(path.join(outputDirectory, fileName))
      pdf.addImage(`data:image/png;base64,${png.toString('base64')}`, 'PNG', 0, 0, 1440, 900, undefined, 'FAST')
    }
    await writeFile(path.join(outputDirectory, 'meeting-task-system-high-fidelity-prototype.pdf'), Buffer.from(pdf.output('arraybuffer')))
  } finally {
    await rm(coverPath, { force: true })
  }
}

async function main() {
  if (!existsSync(chromePath)) throw new Error(`Chrome not found: ${chromePath}`)
  await mkdir(outputDirectory, { recursive: true })
  const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  const server = spawn(process.execPath, [viteEntry, '--host', '127.0.0.1', '--port', String(serverPort), '--strictPort'], {
    cwd: root, stdio: 'inherit', windowsHide: true,
  })
  try {
    await waitForServer()
    for (const [screen, fileName] of screens) await captureScreen(screen, fileName)
    await buildPdf()
    console.log(`Exported ${screens.length} PNG files and one PDF to ${outputDirectory}`)
  } finally {
    server.kill()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
