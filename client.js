window.__ModuleLoader__.load({
  id: 'dsh-workspace-focus',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dshWorkspaceFocus';

    const zh = {
      showAll: '\u5168\u90e8\u5de5\u4f5c\u533a',
      focusCurrent: '\u4ec5\u5f53\u524d\u5de5\u4f5c\u533a',
      showAllHint: '\u8fd4\u56de\u5168\u90e8\u5de5\u4f5c\u533a',
      focusHint: '\u4ec5\u663e\u793a\u5f53\u524d\u5de5\u4f5c\u533a\u7684\u5bf9\u8bdd',
      showAllAria: '\u8fd4\u56de\u5168\u90e8\u5de5\u4f5c\u533a',
      focusAria: '\u4ec5\u663e\u793a\u5f53\u524d\u5de5\u4f5c\u533a',
    };
    const en = {
      showAll: 'All workspaces',
      focusCurrent: 'Current workspace',
      showAllHint: 'Return to the full workspace list',
      focusHint: 'Show only the current workspace conversations',
      showAllAria: 'Return to all workspaces',
      focusAria: 'Show only the current workspace',
    };

    const CONTROL_CLASS = 'dsh-workspace-focus';

    /** Icon-button styling, injected once for the lifetime of the plugin. */
    const CONTROL_CSS = [
      '.' + CONTROL_CLASS + ' {',
      '  -webkit-app-region: no-drag;',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  box-sizing: border-box;',
      '  flex: none;',
      '  width: 28px;',
      '  height: 28px;',
      '  padding: 0;',
      '  margin: 0;',
      '  border: none;',
      '  border-radius: var(--dsw-radius-md, 8px);',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-secondary);',
      '  cursor: pointer;',
      '  -webkit-user-select: none;',
      '  user-select: none;',
      '}',
      '.' + CONTROL_CLASS + ':hover {',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 140, 160, 0.16));',
      '  color: var(--dsw-alias-label-primary);',
      '}',
      '.' + CONTROL_CLASS + ':active { transform: translateY(0.5px); }',
      '.' + CONTROL_CLASS + ':focus-visible {',
      '  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-brand-primary));',
      '  outline-offset: -2px;',
      '}',
      '.' + CONTROL_CLASS + ' svg { flex: none; }',
      /* The glyph carries the brand color while the sidebar is focused. */
      '.' + CONTROL_CLASS + '-active svg { color: var(--dsw-alias-brand-primary, currentColor); }',
      /* While the sidebar is folded away the frame overlays its own expand and
         new-session controls on the header's leading seat; drop our glyph there
         instead of stacking on top of them. The filter itself stays on, so the
         sidebar is still focused when it opens again. */
      '[data-sidebar-collapsed] .' + CONTROL_CLASS + ' { display: none; }',
    ].join('\n');

    /* ------------------------------------------------------------------ *
     * Manual focus state (single boolean, one control owns it)
     * ------------------------------------------------------------------ */

    let focusedSnapshot = false;
    const listeners = new Set();

    /**
     * The filter stylesheet, created once by `apply()` on `document.head`.
     * It lives outside every slot component on purpose: switching the main
     * panel (Workspace / Music / Plugins / Automatic tasks / More) unmounts the
     * conversation header, and the sidebar must stay filtered.
     */
    let filterStyle = null;

    function getFocused() {
      return focusedSnapshot;
    }

    function subscribeFocused(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    function setFocused(next) {
      if (focusedSnapshot === next) return;
      focusedSnapshot = next;
      for (const listener of [...listeners]) listener();
    }

    function useFocused() {
      return React.useSyncExternalStore(subscribeFocused, getFocused, getFocused);
    }

    /** Escape a value for use inside a double-quoted CSS attribute selector. */
    function cssAttrValue(value) {
      return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\a ');
    }

    /**
     * Build the focus stylesheet for one Workspace.
     *
     * The shipped workspace browser renders one `div` per Workspace whose
     * direct children are: a HoverCard `<span>` holding the title row
     * `[data-row-key="workspace:<id>"]`, an optional `[role="group"]` div
     * holding nested Workspace sections, a HoverCard `<span>` per Session row
     * (`[data-row-key="session:<id>"]`) and the "show more" button
     * `[data-row-key^="overflow:"]`. The rules below use that shape: every
     * group that does not contain the focused title row is removed, and the
     * groups that contain it but are not its own group — its ancestors, kept as
     * a breadcrumb — lose their own conversations.
     *
     * @param workspaceId - Workspace to keep on screen.
     * @returns the stylesheet text.
     */
    function focusCss(workspaceId) {
      const key = '[data-row-key="workspace:' + cssAttrValue(workspaceId) + '"]';
      const tree = '[role="tree"]:has(' + key + ')';
      /* A section that contains the focused row but not as its own title row. */
      const ancestor = 'div:has(' + key + '):not(:has(> ' + key + ', > span > ' + key + '))';
      return [
        /* Groups outside the focused branch: top-level and nested ones. */
        tree + ' > div:not([data-row-key]):not(:has(' + key + ')),',
        tree + ' [role="group"] > div:not(:has(' + key + ')) { display: none !important; }',
        /* Ancestor groups keep their row as a breadcrumb, not their conversations.
           Row wrappers are covered too, so a hidden row leaves no gap behind. */
        tree + ' ' + ancestor + ' > [data-row-key^="session:"],',
        tree + ' ' + ancestor + ' > [data-row-key^="overflow:"],',
        tree + ' ' + ancestor + ' > span > [data-row-key^="session:"],',
        tree + ' ' + ancestor + ' > span:has(> [data-row-key^="session:"]) { display: none !important; }',
      ].join('\n');
    }

    /** The Session retained by the main view, i.e. the one the conversation shows. */
    function selectSessionById(state) {
      return state !== undefined && state !== null ? state.byId : undefined;
    }

    /** The Workspace list snapshot; the array keeps its identity until it changes. */
    function selectWorkspaceItems(state) {
      return state !== undefined && state !== null ? state.items : undefined;
    }

    /** Find the Session the main view currently retains, the way the browser does. */
    function findCurrentSessionId(byId) {
      if (byId === undefined || byId === null) return undefined;
      for (const session of Object.values(byId)) {
        if (session !== undefined && session !== null && (session.retainedBy?.mainView ?? 0) > 0) return session.id;
      }
      return undefined;
    }

    /** Find the Workspace that owns one Session, or `undefined` when it is Ungrouped. */
    function findWorkspaceId(items, sessionId) {
      if (sessionId === undefined || items === undefined || items === null) return undefined;
      for (const item of items) {
        if (item !== undefined && item !== null && Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId)) {
          return item.workspaceId;
        }
      }
      return undefined;
    }

    /**
     * Read the open Session and its Workspace from the Client's standard slot
     * hooks, and combine them with the manual focus flag. Focus always follows
     * the open conversation: while it is on, the sidebar keeps the Workspace of
     * whichever Session is showing.
     */
    function useFocusInfo(props) {
      const byId = props.useSessions(selectSessionById);
      const items = props.useWorkspaces(selectWorkspaceItems);
      const enabled = useFocused();

      const currentSessionId = React.useMemo(() => findCurrentSessionId(byId), [byId]);
      const sessionWorkspaceId = React.useMemo(() => findWorkspaceId(items, currentSessionId), [items, currentSessionId]);

      /* A Conversation outside every Workspace has nothing to focus on the next time. */
      React.useEffect(() => {
        if (enabled && sessionWorkspaceId === undefined) setFocused(false);
      }, [enabled, sessionWorkspaceId]);

      const anchorWorkspaceId = enabled ? sessionWorkspaceId : undefined;
      const focused = anchorWorkspaceId !== undefined;
      /* The control only exists while the open conversation belongs to a Workspace. */
      const available = focused || sessionWorkspaceId !== undefined;
      return { anchorWorkspaceId, focused, available };
    }

    /** Back arrow: leave the focused Workspace and show every Workspace again. */
    function BackIcon() {
      return h(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M12.8 8H4.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', {
          d: 'M7.4 4.4 3.8 8l3.6 3.6',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    /** Focus frame: come back to the current Workspace only. */
    function FocusIcon() {
      return h(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M5.6 2.2H4A1.8 1.8 0 0 0 2.2 4v1.6M10.4 2.2H12A1.8 1.8 0 0 1 13.8 4v1.6M2.2 10.4V12A1.8 1.8 0 0 0 4 13.8h1.6M13.8 10.4V12a1.8 1.8 0 0 1-1.8 1.8h-1.6',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 8, cy: 8, r: 2.1, stroke: 'currentColor', strokeWidth: 1.4 }),
      );
    }

    /** Translation with an English fallback when the namespace is not bound. */
    function translate(props) {
      const t = typeof props.t === 'function' ? props.t : null;
      return (key) => {
        const value = t === null ? key : t(key);
        return value === key ? (en[key] ?? key) : value;
      };
    }

    /**
     * Icon-only control in the conversation header. Clicking it turns the
     * manual focus on for the open conversation's Workspace, and clicking it
     * again shows every Workspace. No text is rendered; the action and its
     * state live in the accessible name and the native tooltip.
     */
    function WorkspaceFocusControl(props) {
      const info = useFocusInfo(props);
      const tr = translate(props);
      const focused = info.focused;
      const anchorWorkspaceId = info.anchorWorkspaceId;

      /* Keep the plugin-owned stylesheet in step with the focus state. The
         stylesheet itself outlives this control, so a main-panel switch does
         not release the filter. */
      React.useEffect(() => {
        if (filterStyle === null) return;
        filterStyle.textContent = focused ? focusCss(anchorWorkspaceId) : '';
      }, [focused, anchorWorkspaceId]);

      if (!info.available) return null;

      const hint = focused ? tr('showAllHint') : tr('focusHint');
      const aria = focused ? tr('showAllAria') : tr('focusAria');

      return h(
        'button',
        {
          type: 'button',
          className: focused ? CONTROL_CLASS + ' ' + CONTROL_CLASS + '-active' : CONTROL_CLASS,
          title: hint,
          'aria-label': aria,
          'aria-pressed': focused,
          onMouseDown: (event) => {
            /* The header is a window drag region; keep the press on the control. */
            event.stopPropagation();
          },
          onClick: () => {
            setFocused(!focused);
          },
        },
        focused ? h(BackIcon) : h(FocusIcon),
      );
    }

    function apply(ctx) {
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, { zh, en });
        } catch (error) {
          /* A missing locale service must not disable the control itself. */
          console.warn('[dsh-workspace-focus] locale registration failed:', error);
          return () => {};
        }
      }, 'dsh-workspace-focus: dictionaries');

      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshWorkspaceFocus = 'control';
        style.textContent = CONTROL_CSS;
        document.head.append(style);
        return () => style.remove();
      }, 'dsh-workspace-focus: control styles');

      /* The filter stylesheet is plugin-scoped, not component-scoped: the
         sidebar keeps its focus while another main panel is showing. */
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.dshWorkspaceFocus = 'filter';
        document.head.append(style);
        filterStyle = style;
        return () => {
          if (filterStyle === style) filterStyle = null;
          style.remove();
        };
      }, 'dsh-workspace-focus: filter styles');

      ctx.slots.inject('conversation.header.leading', () =>
        ctx.slots.register(
          {
            name: 'conversation.header.leading',
            locale: NS,
          },
          WorkspaceFocusControl,
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    };
  },
});
