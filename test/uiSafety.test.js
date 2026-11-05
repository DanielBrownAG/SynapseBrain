import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function element() {
  const node = { children: [], textContent: '', classList: { add() {}, remove() {} }, appendChild(child) { this.children.push(child); } };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('Model output must not enter an HTML parser'); } });
  return node;
}

test('activity and orchestration rendering treat model-generated markup as literal text', () => {
  const source = readFileSync(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  const UI = vm.runInNewContext(source + '\nDigitalBrainUI', {
    document: { createElement: element, addEventListener() {} }, setTimeout() {}
  });
  const ui = Object.create(UI.prototype);
  ui.activityLog = element();
  const injection = '<img src=x onerror="alert(1)">';
  ui.addActivityItem(injection, { reasoning: injection, decision: injection, nextModules: [injection], status: 'failed', error: injection, timestamp: new Date().toISOString() });
  ui.displayOrchestrationLog({ duration: 1, moduleExecutionOrder: [injection], skippedModules: [injection] });
  const text = node => [node.textContent, ...node.children.map(text)].join(' ');
  assert.ok(text(ui.activityLog).includes(injection));
  assert.equal(ui.activityLog.children.length, 2);
});
