import { describe, it, expect } from 'vitest'
import { classifyRisk } from '../src/core/risk.ts'

/** Shell command via bash/pwsh â€?the risk field is `args.command`. */
function shell(command: string) {
  return { toolName: 'bash', args: { command, description: 'run' } }
}

describe('classifyRisk â€?shell destructive patterns', () => {
  it('flags recursive directory deletion (rm -rf) as high', () => {
    expect(classifyRisk(shell('rm -rf ./src'))).toMatchObject({ risk: 'high' })
  })
  it('flags rm with -r and a glob as high', () => {
    expect(classifyRisk(shell('rm -r /data*'))).toMatchObject({ risk: 'high' })
  })
  it('does not flag a harmless echo', () => {
    expect(classifyRisk(shell('echo hello'))).toMatchObject({ risk: 'none' })
  })
  it('does not flag a plain file read', () => {
    expect(classifyRisk(shell('cat README.md'))).toMatchObject({ risk: 'none' })
  })
})

describe('classifyRisk â€?git dangerous operations', () => {
  it('flags git push --force as high', () => {
    expect(classifyRisk(shell('git push --force origin main'))).toMatchObject({ risk: 'high' })
  })
  it('flags git push --force-with-lease as high', () => {
    expect(classifyRisk(shell('git push --force-with-lease origin main'))).toMatchObject({ risk: 'high' })
  })
  it('flags git reset --hard as high', () => {
    expect(classifyRisk(shell('git reset --hard HEAD~3'))).toMatchObject({ risk: 'high' })
  })
  it('flags git clean -fd as high', () => {
    expect(classifyRisk(shell('git clean -fd'))).toMatchObject({ risk: 'high' })
  })
  it('does not flag a normal git commit', () => {
    expect(classifyRisk(shell('git commit -m "fix"'))).toMatchObject({ risk: 'none' })
  })
})

describe('classifyRisk â€?database destruction', () => {
  it('flags DROP DATABASE as high', () => {
    expect(classifyRisk(shell('mysql -e "DROP DATABASE app"'))).toMatchObject({ risk: 'high' })
  })
  it('flags TRUNCATE as high', () => {
    expect(classifyRisk(shell('psql -c "TRUNCATE TABLE orders"'))).toMatchObject({ risk: 'high' })
  })
  it('flags DELETE without WHERE as high', () => {
    expect(classifyRisk(shell('mysql -e "DELETE FROM users"'))).toMatchObject({ risk: 'high' })
  })
  it('does not flag a SELECT query', () => {
    expect(classifyRisk(shell('mysql -e "SELECT * FROM users"'))).toMatchObject({ risk: 'none' })
  })
})

describe('classifyRisk â€?system / service / process', () => {
  it('flags kill -9 as high', () => {
    expect(classifyRisk(shell('kill -9 1234'))).toMatchObject({ risk: 'high' })
  })
  it('flags recursive chmod to root as high', () => {
    expect(classifyRisk(shell('chmod -R 777 /'))).toMatchObject({ risk: 'high' })
  })
  it('does not flag a normal process list', () => {
    expect(classifyRisk(shell('ps aux'))).toMatchObject({ risk: 'none' })
  })
})

describe('classifyRisk â€?overwrite critical config via fs tools', () => {
  it('flags writing to a credentials/config path as high', () => {
    expect(classifyRisk({ toolName: 'write', args: { file_path: '/etc/credentials.json', content: '{"x":1}' } }))
      .toMatchObject({ risk: 'high' })
  })
  it('does not flag writing a workspace note', () => {
    expect(classifyRisk({ toolName: 'write', args: { file_path: './notes.txt', content: 'hi' } }))
      .toMatchObject({ risk: 'none' })
  })
})

describe('classifyRisk â€?edge cases', () => {
  it('unknown tool with no args is none', () => {
    expect(classifyRisk({ toolName: 'web_search', args: {} })).toMatchObject({ risk: 'none' })
  })
  it('missing args object is none (fail-open)', () => {
    expect(classifyRisk({ toolName: 'bash', args: undefined as never })).toMatchObject({ risk: 'none' })
  })
  it('reports a readable reason for a high-risk hit', () => {
    const d = classifyRisk(shell('rm -rf ./build'))
    expect(d.reason).toBeTruthy()
  })
})
