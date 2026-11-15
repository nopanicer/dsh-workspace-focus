/**
 * Smoke test for the Client half without a browser or React.
 *
 * `client.js` is loaded the way the page loads it (`window.__ModuleLoader__`),
 * with a tiny React stand-in. The focus filter now lives in a plugin-owned
 * `<style>` element on `document.head` (not in the control), so the tests check
 * that the stylesheet outlives the conversation header component.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

/* ---------- the smallest React that can render this control ---------- */

const Fragment = Symbol('Fragment');
let hookState = { values: [], cursor: 0 };

/** Begin a new mounted instance: hooks start from their initial values. */
function resetHooks() {
  hookState = { values: [], cursor: 0 };
}

/** Begin a render pass of the current instance: hook order restarts, values persist. */
function beginRender() {
  hookState.cursor = 0;
}

const react = {
  Fragment,
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat(Infinity) };
  },
  useState(initial) {
    const index = hookState.cursor;
    hookState.cursor += 1;
    if (index >= hookState.values.length) hookState.values[index] = initial;
    return [
      hookState.values[index],
      (next) => {
        hookState.values[index] = typeof next === 'function' ? next(hookState.values[index]) : next;
      },
    ];
  },
  useRef(initial) {
    const index = hookState.cursor;
    hookState.cursor += 1;
    if (index >= hookState.values.length) hookState.values[index] = { current: initial };
    return hookState.values[index];
  },
  useMemo(run) {
    hookState.cursor += 1;
    return run();
  },
  useEffect(run) {
    hookState.cursor += 1;
    /* Effects run inline in this harness so the stylesheet sync is observable. */
    return run();
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    hookState.cursor += 1;
    return getSnapshot();
  },
};

/* ---------- fake DOM ---------- */

let declaration;
const documentListeners = new Map();

globalThis.window = {
  __ModuleLoader__: {
    load(loaded) {
      declaration = loaded;
    },
  },
};

globalThis.document = {
  createElement(tag) {
    return { tag, dataset: {}, textContent: '', remove() {} };
  },
  head: {
    appended: [],
    append(node) {
      this.appended.push(node);
    },
  },
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  },
  removeEventListener(type) {
    documentListeners.delete(type);
  },
};

globalThis.Element = class Element {};

/* ---------- module load ---------- */

await import(new URL('../client.js', import.meta.url).href);

function loadModule() {
  assert.equal(declaration.id, 'dsh-workspace-focus');
  return declaration.factory((id) => {
    assert.equal(id, 'react');
    return react;
  });
}

/* ---------- apply ---------- */

let applied;

function applyOnce() {
  if (applied !== undefined) return applied;
  const plugin = loadModule();
  assert.deepEqual(plugin.inject, ['slots', 'locale']);

  const registrations = new Map();
  const locales = [];

  plugin.apply({
    effect(run) {
      return run();
    },
    locale: {
      register(namespace, dictionaries) {
        locales.push({ namespace, dictionaries });
        return () => {};
      },
    },
    slots: {
      inject(_key, install) {
        install();
        return () => {};
      },
      register(options, component) {
        registrations.set(options.name, { options, component });
        return () => {};
      },
    },
  });

  applied = { registrations, locales };
  return applied;
}

/** The plugin-owned filter stylesheet, looked up on the fake document.head. */
function filterStyle() {
  return document.head.appended.find((node) => node.dataset.dshWorkspaceFocus === 'filter');
}

function controlStyle() {
  return document.head.appended.find((node) => node.dataset.dshWorkspaceFocus === 'control');
}

test('apply registers one header control, its dictionaries and two stylesheets', () => {
  const { registrations, locales } = applyOnce();

  assert.deepEqual([...registrations.keys()], ['conversation.header.leading']);
  assert.equal(registrations.get('conversation.header.leading').options.locale, 'dshWorkspaceFocus');

  assert.equal(locales.length, 1);
  assert.equal(locales[0].dictionaries.zh.focusHint, '仅显示当前工作区的对话');
  assert.equal(locales[0].dictionaries.en.showAll, 'All workspaces');

  assert.equal(document.head.appended.length, 2);
  assert.match(controlStyle().textContent, /\.dsh-workspace-focus \{/);
  assert.match(controlStyle().textContent, /width: 28px/);
  /* Folded sidebar: the frame's own expand/new-session seat owns that spot. */
  assert.match(controlStyle().textContent, /\[data-sidebar-collapsed\] \.dsh-workspace-focus \{ display: none; \}/);
  assert.equal(filterStyle().textContent, '', 'the filter starts empty');

  /* The old row-click navigation is gone. */
  assert.equal(documentListeners.has('click'), false);
});

/* ---------- rendering ---------- */

const workspaceA = 'a4f9c1e2-0000-4000-8000-000000000001';
const workspaceB = 'b4f9c1e2-0000-4000-8000-000000000002';

function props({ session, workspaces }) {
  return {
    t: (key) => 'tr:' + key,
    useSessions: (select) => select({ byId: session }),
    useWorkspaces: (select) => select({ items: workspaces }),
  };
}

const sessionsInA = {
  s1: { id: 's1', retainedBy: { mainView: 1 } },
  s2: { id: 's2', retainedBy: {} },
};
const sessionsInB = {
  s1: { id: 's1', retainedBy: {} },
  s2: { id: 's2', retainedBy: { mainView: 1 } },
};
const workspaces = [
  { workspaceId: workspaceA, sessionIds: ['s1'] },
  { workspaceId: workspaceB, sessionIds: ['s2'] },
];

function buttonOf(tree) {
  assert.equal(tree.type, 'button');
  return tree;
}

function textOf(node) {
  return node.children
    .flat(Infinity)
    .filter((child) => child !== null && child !== undefined)
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

function render(input) {
  beginRender();
  return applied.registrations.get('conversation.header.leading').component(input);
}

/** Focus state is module-level; every test starts from "off". */
function turnFocusOff(input) {
  const tree = render(input);
  if (tree === null) return;
  if (buttonOf(tree).props['aria-pressed'] !== true) return;
  buttonOf(render(input)).props.onClick();
  render(input);
}

test('the default view is every workspace, and the control renders an icon only', () => {
  resetHooks();
  filterStyle().textContent = '';
  const tree = render(props({ session: sessionsInA, workspaces }));

  assert.equal(filterStyle().textContent, '', 'no filtering before the user asks for it');
  const button = buttonOf(tree);
  assert.equal(button.props['aria-pressed'], false);
  assert.equal(button.props['aria-label'], 'tr:focusAria');
  assert.equal(button.props.title, 'tr:focusHint');
  assert.equal(textOf(button), '', 'no visible text, icon only');
  assert.equal(button.children.filter((child) => child !== null && child !== undefined).length, 1);
});

test('the control focuses the current workspace and shows the way back', () => {
  resetHooks();
  const input = props({ session: sessionsInA, workspaces });
  turnFocusOff(input);

  buttonOf(render(input)).props.onClick();

  const tree = render(input);
  const key = '[data-row-key="workspace:' + workspaceA + '"]';
  const css = filterStyle().textContent;
  assert.ok(css.includes('[role="tree"]:has(' + key + ')'), css);
  assert.ok(css.includes('[role="group"] > div:not(:has(' + key + '))'), css);

  const button = buttonOf(tree);
  assert.equal(button.props['aria-pressed'], true);
  assert.equal(button.props['aria-label'], 'tr:showAllAria');
  assert.equal(textOf(button), '');

  button.props.onClick();

  render(input);
  assert.equal(filterStyle().textContent, '');
  assert.equal(buttonOf(render(input)).props['aria-pressed'], false);
});

test('the filter outlives the conversation header (main-panel switches keep it)', () => {
  resetHooks();
  const input = props({ session: sessionsInA, workspaces });
  const key = '[data-row-key="workspace:' + workspaceA + '"]';
  turnFocusOff(input);

  buttonOf(render(input)).props.onClick();
  render(input);
  const cssWhileMounted = filterStyle().textContent;
  assert.ok(cssWhileMounted.includes(key), cssWhileMounted);

  /* Opening another main panel unmounts this control: no render happens, and
     the plugin-owned stylesheet keeps filtering the sidebar. */
  assert.ok(filterStyle().textContent.includes(key), filterStyle().textContent);
  assert.notEqual(filterStyle(), controlStyle(), 'the filter is a plugin stylesheet, not the control styles');

  /* Coming back re-syncs the same stylesheet. */
  render(input);
  assert.equal(filterStyle().textContent, cssWhileMounted);
});

test('focus follows the open conversation while it is on', () => {
  resetHooks();
  const inA = props({ session: sessionsInA, workspaces });
  turnFocusOff(inA);

  buttonOf(render(inA)).props.onClick();
  render(inA);
  assert.ok(filterStyle().textContent.includes('[data-row-key="workspace:' + workspaceA + '"]'));

  render(props({ session: sessionsInB, workspaces }));
  assert.ok(filterStyle().textContent.includes('[data-row-key="workspace:' + workspaceB + '"]'), 'the new workspace is focused');

  buttonOf(render(inA)).props.onClick();
  render(inA);
  assert.equal(filterStyle().textContent, '');
});

test('no control without a workspace-backed Session', () => {
  resetHooks();
  const ungrouped = { s9: { id: 's9', retainedBy: { mainView: 1 } } };
  assert.equal(render(props({ session: ungrouped, workspaces })), null);
  assert.equal(render(props({ session: {}, workspaces })), null);
  assert.equal(filterStyle().textContent, '');
});
