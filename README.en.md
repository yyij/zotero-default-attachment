# Default Attachment

[简体中文](README.md)

Choose which attachment opens when you double-click a Zotero item. This is useful when an item contains the original article, a translation, and supplementary files.

## Install or update

This release can be installed on **Zotero 10.0.7 and later 10.0.x versions**. If you use a different Zotero version, please test compatibility yourself. Download [`default-attachment-choice-1.2.2.xpi`](https://github.com/yyij/zotero-default-attachment/releases/tag/v1.2.2) from the repository’s Releases page. In Zotero, open **Tools → Plugins**, click the gear icon, and choose **Install Plugin From File**. Install a newer XPI the same way. Your existing default attachment choices are kept.

## Use the plugin

1. Expand a parent item, right-click a file attachment, and choose **Set as Default Attachment**.
2. Double-click the parent item to open that attachment. Use the parent item’s context menu to locate or clear its default.
3. To set defaults in bulk, select the parent items, right-click, and choose **Set Default Attachments in Bulk…**. Set a rule, preview the matches, and click **Apply**.

For example, a file-name rule that ends with `translation` matches `Paper translation.pdf` because the extension is ignored. If an item has several matches, choose one in the preview or leave the item unchanged. Existing defaults are kept unless you enable replacement. **Undo Last Bulk Change** preserves items that you changed manually afterward.

## Language and local settings

The menus, bulk dialog, and messages follow Zotero’s interface language. The plugin provides Chinese and English, with English as the fallback. Default choices are stored in your local Zotero profile. Renaming an attachment keeps its selection. If the attachment is unavailable, the plugin reports it and uses Zotero’s usual opening behavior.

When reporting a problem, include your Zotero version, plugin version, steps, and what you observed. Use sample items in screenshots.
