/* global Zotero, Services, Components */
const ICON = "chrome://default-attachment-choice/content/icon-b1.svg";
const PREF = "extensions.defaultAttachmentChoice.state";
const windows = new Map();
const dialogs = new Set();
let chromeHandle;
let menuID;

function readState() {
  return JSON.parse(Services.prefs.getStringPref(PREF, "{}"));
}

function writeState(state) {
  Services.prefs.setStringPref(PREF, JSON.stringify(state));
}

function itemKey(item) {
  return item.libraryID + ":" + item.key;
}

function isParent(item) {
  return Boolean(item) && item.isRegularItem() && !item.deleted && Zotero.Libraries.get(item.libraryID)?.libraryType !== "feed";
}

function isChild(item) {
  return Boolean(item) && item.isFileAttachment() && !item.deleted && isParent(item.parentItem);
}

function children(parent) {
  return Zotero.Items.get(parent.getAttachments()).filter(isChild);
}

function resolve(parent, key) {
  return key && children(parent).find(item => item.key === key);
}

function selectedParent({ items }) {
  const item = items?.length === 1 && items[0];
  return isParent(item) ? item : null;
}

function selectedChild({ items }) {
  const item = items?.length === 1 && items[0];
  return isChild(item) ? item : null;
}

function manualSet(parent, attachment) {
  const state = readState();
  const id = itemKey(parent);
  state.defaults ??= {};
  if (attachment) state.defaults[id] = attachment.key;
  else delete state.defaults[id];
  if (state.undo) delete state.undo[id];
  writeState(state);
}

function displayName(item) {
  return item.getField("title") || item.attachmentFilename || item.key;
}

async function notify(win, messageID, args) {
  const [name, message] = await win.document.l10n.formatValues([
    { id: "dac-name" },
    { id: messageID, args }
  ]);
  const popup = new Zotero.ProgressWindow({ closeOnClick: true });
  popup.changeHeadline(name);
  popup.addDescription(message);
  popup.show();
  popup.startCloseTimer(4200);
}

function undo(win) {
  const state = readState();
  const entries = Object.entries(state.undo ?? {});
  if (!entries.length) return;
  let count = 0;
  for (const [id, change] of entries) {
    if (state.defaults[id] !== change.after) continue;
    if (change.before) state.defaults[id] = change.before;
    else delete state.defaults[id];
    count++;
  }
  delete state.undo;
  writeState(state);
  return notify(win, "dac-restored", { count });
}

function preview(parents, rule) {
  const state = readState();
  state.rule = { ...rule, overwrite: false };
  writeState(state);
  const needle = rule.keyword.trim().toLowerCase();
  const methods = { start: "startsWith", end: "endsWith", includes: "includes" };
  if (!needle) return [];
  return parents.map(parent => {
    const id = itemKey(parent);
    const before = state.defaults?.[id];
    const current = resolve(parent, before);
    const matches = children(parent).filter(attachment => {
      const name = rule.source === "filename"
        ? (attachment.attachmentFilename || "").replace(/\.[^.]+$/, "")
        : (attachment.getField("title") || "");
      return name.trim().toLowerCase()[methods[rule.mode]](needle);
    });
    return {
      id, parent, before,
      title: parent.getDisplayTitle(),
      current: current ? displayName(current) : "",
      protected: Boolean(current && !rule.overwrite),
      candidates: matches.map(item => ({
        key: item.key,
        label: [displayName(item), item.attachmentFilename]
          .filter((name, i, names) => name && names.indexOf(name) === i).join(" · ")
      }))
    };
  });
}

function applyPreview(rows) {
  const state = readState();
  const changes = {};
  state.defaults ??= {};
  let stale = 0;
  for (const { id, parent, before, choice } of rows) {
    if (!choice || choice === before) continue;
    const liveParent = Zotero.Items.get(parent.id);
    if (!isParent(liveParent) || itemKey(liveParent) !== id
        || state.defaults[id] !== before || !resolve(liveParent, choice)) {
      stale++;
      continue;
    }
    changes[id] = { before, after: choice };
    state.defaults[id] = choice;
  }
  const count = Object.keys(changes).length;
  if (count) {
    state.undo = changes;
    writeState(state);
  }
  return { count, stale };
}

function openBatch(win, items) {
  const parents = items.filter(isParent);
  if (!parents.length) return;
  const dialog = win.openDialog("chrome://default-attachment-choice/content/batch.xhtml",
    "_blank", "chrome,centerscreen,resizable,width=840,height=590", {
      count: parents.length,
      language: /^zh(?:-|$)/i.test(Services.locale.appLocaleAsBCP47) ? "zh-CN" : "en",
      rule: readState().rule,
      preview: rule => preview(parents, rule),
      apply: rows => applyPreview(rows)
    });
  dialogs.add(dialog);
  dialog.addEventListener("unload", () => dialogs.delete(dialog), { once: true });
}

function registerMenus(pluginID) {
  const keyFor = item => item && readState().defaults?.[itemKey(item)];
  const currentParent = context => selectedChild(context)?.parentItem ?? selectedParent(context);
  const hasDefault = context => Boolean(keyFor(currentParent(context)));
  const menu = (id, visible, command) => ({
    menuType: "menuitem",
    l10nID: "dac-" + id,
    icon: ICON,
    onShowing: (_event, context) => context.setVisible(Boolean(visible(context))),
    onCommand(event, context) {
      const win = event.target.ownerGlobal;
      return Promise.resolve().then(() => command(win, context)).catch(async error => {
        Zotero.logError(error);
        const [name, message] = await win.document.l10n.formatValues([
          { id: "dac-name" },
          { id: "dac-operation-error" }
        ]);
        Zotero.alert(win, name, message);
      });
    }
  });

  menuID = Zotero.MenuManager.registerMenu({
    menuID: "default-attachment-choice",
    pluginID,
    target: "main/library/item",
    menus: [
      menu("set", context => {
        const child = selectedChild(context);
        return child && keyFor(child.parentItem) !== child.key;
      }, (_win, context) => {
        const child = selectedChild(context);
        if (child) manualSet(child.parentItem, child);
      }),
      menu("locate", context => selectedParent(context) && hasDefault(context),
        async (win, context) => {
          const parent = selectedParent(context);
          const item = parent && resolve(parent, keyFor(parent));
          if (item) await win.ZoteroPane.selectItem(item.id);
          else await notify(win, "dac-missing");
        }),
      menu("clear", context => {
        const child = selectedChild(context);
        return child ? keyFor(child.parentItem) === child.key : hasDefault(context);
      }, (_win, context) => {
        const parent = currentParent(context);
        if (parent) manualSet(parent);
      }),
      menu("batch", context => context.items?.some(isParent),
        (win, context) => openBatch(win, context.items)),
      menu("undo", () => Object.keys(readState().undo ?? {}).length > 0, undo)
    ]
  });
}

function onMainWindowLoad({ window }) {
  if (windows.has(window)) return;
  window.MozXULElement.insertFTLIfNeeded("default-attachment-choice.ftl");
  const pane = window.ZoteroPane;
  const original = pane.onItemTreeActivate;
  const replacement = async function (event, items) {
    const parent = items.length === 1 && items[0];
    if (event.type !== "dblclick" || !Zotero.Prefs.get("viewOnDoubleClick") || !isParent(parent)) {
      return original.call(this, event, items);
    }

    let messageID;
    try {
      const key = readState().defaults?.[itemKey(parent)];
      if (key) {
        const item = resolve(parent, key);
        if (item && await item.fileExists()) {
          return await pane.viewItems([item], event);
        }
        messageID = "dac-fallback-unavailable";
      }
    }
    catch (error) {
      Zotero.logError(error);
      messageID = "dac-fallback-error";
    }
    if (messageID) notify(window, messageID).catch(error => Zotero.logError(error));
    return original.call(this, event, items);
  };
  pane.onItemTreeActivate = replacement;
  windows.set(window, { pane, original, replacement });
}

function onMainWindowUnload({ window }) {
  const patch = windows.get(window);
  if (!patch) return;
  if (patch.pane.onItemTreeActivate === patch.replacement) {
    patch.pane.onItemTreeActivate = patch.original;
  }
  windows.delete(window);
}

function startup({ id, rootURI }) {
  const manifest = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
    .getService(Components.interfaces.amIAddonManagerStartup)
    .registerChrome(manifest, [["content", "default-attachment-choice", "content/"]]);
  registerMenus(id);
  for (const window of Zotero.getMainWindows()) onMainWindowLoad({ window });
}

function shutdown() {
  for (const dialog of dialogs) dialog.close();
  for (const window of windows.keys()) onMainWindowUnload({ window });
  if (menuID) Zotero.MenuManager.unregisterMenu(menuID);
  chromeHandle?.destruct();
}
