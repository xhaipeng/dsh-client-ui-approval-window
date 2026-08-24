// In-process verification script (no test runner / no child spawn â€?the sandbox
// blocks spawn, so this asserts the classifier's behaviour directly via node).
// Run: node tests/risk.run.ts
import assert from 'node:assert/strict'
import { classifyRisk } from '../src/core/risk.ts'

const shell = (command: string) => ({ toolName: 'bash', args: { command, description: 'run' } })
const high = (d: { risk: string }) => assert.equal(d.risk, 'high', `expected high, got ${d.risk}`)
const none = (d: { risk: string }) => assert.equal(d.risk, 'none', `expected none, got ${d.risk}`)

// file/dir destruction
high(classifyRisk(shell('rm -rf ./src')))
high(classifyRisk(shell('rm -r /data*')))
none(classifyRisk(shell('echo hello')))
none(classifyRisk(shell('cat README.md')))
// git dangerous
high(classifyRisk(shell('git push --force origin main')))
high(classifyRisk(shell('git push --force-with-lease origin main')))
high(classifyRisk(shell('git reset --hard HEAD~3')))
high(classifyRisk(shell('git clean -fd')))
none(classifyRisk(shell('git commit -m "fix"')))
// db destruction
high(classifyRisk(shell('mysql -e "DROP DATABASE app"')))
high(classifyRisk(shell('psql -c "TRUNCATE TABLE orders"')))
high(classifyRisk(shell('mysql -e "DELETE FROM users"')))
none(classifyRisk(shell('mysql -e "SELECT * FROM users"')))
// system / service / process
high(classifyRisk(shell('kill -9 1234')))
high(classifyRisk(shell('chmod -R 777 /')))
none(classifyRisk(shell('ps aux')))
// overwrite critical config via fs tools
high(classifyRisk({ toolName: 'write', args: { file_path: '/etc/credentials.json', content: '{"x":1}' } }))
none(classifyRisk({ toolName: 'write', args: { file_path: './notes.txt', content: 'hi' } }))
// edge cases
none(classifyRisk({ toolName: 'web_search', args: {} }))
none(classifyRisk({ toolName: 'bash', args: undefined as never }))
assert.ok(classifyRisk(shell('rm -rf ./build')).reason)

console.log('classifyRisk: all assertions passed')
