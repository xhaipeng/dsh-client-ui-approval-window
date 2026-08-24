import { describe, it, expect } from 'vitest'
import { classifyRisk } from '../src/core/risk.ts'

/** PowerShell native command — the risk field is `args.command`. */
function shell(command: string) {
  return { toolName: 'pwsh', args: { command, description: 'run' } }
}

/** The full script the user flagged: removes a variable directory recursively & forced. */
const userScript = `$item = Get-Item $t -Force
"Attributes: $($item.Attributes)"
"LinkType: $($item.LinkType)"
if ($item.LinkType) { "TARGET: $($item.Target)" }
if (Test-Path $t) {
  Remove-Item -Path $t -Recurse -Force -ErrorAction Continue
  "after remove, exists: $(Test-Path $t)"
  if (Test-Path $t) { "remaining: $((Get-ChildItem $t -Recurse -File -ErrorAction SilentlyContinue).Count) files" }
}`

describe('classifyRisk — PowerShell-native recursive deletion', () => {
  it('flags the user full Remove-Item -Recurse -Force script as high', () => {
    expect(classifyRisk(shell(userScript))).toMatchObject({ risk: 'high' })
  })
  it('flags Remove-Item -Recurse -Force as high', () => {
    expect(classifyRisk(shell('Remove-Item -Path "C:\\tmp\\x" -Recurse -Force'))).toMatchObject({ risk: 'high' })
  })
  it('flags Remove-Item -Recurse as high', () => {
    expect(classifyRisk(shell('Remove-Item -Path "$t" -Recurse'))).toMatchObject({ risk: 'high' })
  })
  it('flags del -Recurse as high', () => {
    expect(classifyRisk(shell('del -Path "C:\\tmp\\x" -Recurse -Force'))).toMatchObject({ risk: 'high' })
  })
  it('flags rd /s as high (cmd recursive remove dir)', () => {
    expect(classifyRisk(shell('rd /s /q "C:\\tmp\\x"'))).toMatchObject({ risk: 'high' })
  })
  it('flags rmdir /s as high', () => {
    expect(classifyRisk(shell('rmdir /s "C:\\tmp\\x"'))).toMatchObject({ risk: 'high' })
  })
  it('flags del /s as high (recursive delete)', () => {
    expect(classifyRisk(shell('del /s /q "C:\\tmp\\*.log"'))).toMatchObject({ risk: 'high' })
  })
  it('does NOT flag a single-file Remove-Item (no recursion)', () => {
    expect(classifyRisk(shell('Remove-Item -Path "C:\\tmp\\x.txt" -Force'))).toMatchObject({ risk: 'none' })
  })
  it('does NOT flag Get-ChildItem -Recurse (read-only listing)', () => {
    expect(classifyRisk(shell('Get-ChildItem "C:\\tmp" -Recurse -File'))).toMatchObject({ risk: 'none' })
  })
  it('does NOT flag Get-Item -Force (read-only attribute)', () => {
    expect(classifyRisk(shell('Get-Item "C:\\tmp\\x" -Force'))).toMatchObject({ risk: 'none' })
  })
})
