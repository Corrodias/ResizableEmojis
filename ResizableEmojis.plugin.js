/** == BetterDiscord plugin ==
 * @name         ResizableEmojis
 * @version      1.2
 * @description  Enlarges and loads higher resolution versions of emojis.
 * @author       Corrodias
 * @icon         https://www.google.com/s2/favicons?sz=64&domain=discord.com
 * @license      MIT
*/

// ==UserScript==
// @name         Discord: resizable, high quality emojis
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Enlarges and loads higher resolution versions of emojis on Discord.
// @author       Corrodias
// @match        https://discord.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=discord.com
// @grant        GM.setValue
// @grant        GM.getValue
// @license      MIT
// ==/UserScript==

/*jshint esversion: 11 */

(async function () {
    'use strict';

    const validEmojiSizes = [16, 32, 48, 64, 80, 96, 128];

    var emojiUrlSize = 48;
    var css = '';

    const defaultSettings = {
        newEmojiSize: 64,
        newPickerWidth: 1010,
        newPickerHeight: 600
    };
    var settings = {};

    function loadAndOverwriteSettingsValue(key) {
        let value = settings[key]
            ? isFinite(settings[key])
                ? settings[key]
                : parseInt(settings[key])
            : NaN;
        if (isNaN(value)) value = defaultSettings[key];
        settings[key] = value;
        return value;
    }

    function configure() {
        let newEmojiSize = loadAndOverwriteSettingsValue('newEmojiSize');
        let newPickerWidth = loadAndOverwriteSettingsValue('newPickerWidth');
        let newPickerHeight = loadAndOverwriteSettingsValue('newPickerHeight');

        let emojiRowWidth = newPickerWidth - 48 - 16; // category panel is 48 wide. there is a margin.
        let emojiCountPerRow = Math.floor(emojiRowWidth / (newEmojiSize + 8)); // each emoji button has an 8px margin.
        // this is how many emojis we want to fit in the row. now, calculate the desired width of the panel so that this number of 48px buttons fit (used to be 40px).
        // this is because the grid layout code for the panel chooses how many buttons to put on each row based on its width, assuming original-sized buttons.
        let initialPanelWidth = (emojiCountPerRow * 48) + 48 + 16;

        // Here's where stuff gets persisted.

        // Find the smallest, valid URL size we can get away with for the desired emoji size.
        emojiUrlSize = validEmojiSizes.find(e => e >= newEmojiSize) ?? 128;

        // .emojiItem-277VFM.emojiItemMedium-2stgkv is the reaction picker buttons
        // .emojiListRowMediumSize-2_-xbz is the grid
        // .emojiItemMedium-2stgkv .image-3tDi44 is the image
        // .emojiImage-1mTIfi is the inline picker when you type a colon

        css = `
main[class*="chatContent-"] .emoji, main[class*="chatContent-"] .emote {
    height: ${newEmojiSize}px !important;
    width: ${newEmojiSize}px !important;
    max-height: none !important;
    max-width: none !important;
    vertical-align: bottom;
}

div[class*="emojiPicker-"] {
    height: ${newPickerHeight}px;
    width: ${initialPanelWidth}px;
}

section[class*="positionContainer-"] {
    height: ${newPickerHeight}px;
}

button[class*="emojiItemMedium-"] {
    height: ${newEmojiSize + 8}px;
    width: ${newEmojiSize + 8}px;
}

ul[class*="emojiListRowMediumSize-"] {
    height: ${newEmojiSize + 8}px;
    grid-template-columns: repeat(auto-fill, ${newEmojiSize + 8}px);
}

button[class*="emojiItemMedium-"] img[class*="image-"] {
    height: ${newEmojiSize}px !important;
    width: ${newEmojiSize}px !important;
}

img[class*="emojiImage-"] {
    height: ${newEmojiSize}px !important;
    width: ${newEmojiSize}px !important;
}
`;
        reload();
    }

    function processMutation(mutation) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            replaceAllImageSources(node);
            resizeReactionPicker(node);
        }
    }

    function resizeReactionPicker(element) {
        // let the CSS give it a default size calculated to insert the correct number of emojis per row.
        // then resize it after it's added, which does NOT alter the number of emojis per row.

        let panel = null;
        if (hasClassPrefix(element, 'emojiPicker-')) panel = element;
        else panel = element.querySelector('div[class*="emojiPicker-"]');

        if (panel === null) return;
        if (hasClassPrefix(panel.parentNode, 'emojiPickerInExpressionPicker-')) return; // do not resize the chat picker, just the reaction picker.

        panel.style.width = settings.newPickerWidth.toString() + 'px';
    }

    function hasClassPrefix(element, prefix) {
        for (let clazz of element.classList.values()) {
            if (clazz.startsWith(prefix)) return true;
        }
        return false;
    }

    function replaceAllImageSources(element) {
        element.querySelectorAll('img').forEach(img => {
            // Only replace emojis.
            if (!/^https:\/\/cdn.discordapp.com\/emojis\/.*?\?.*?size=\d+.*$/.test(img.src)) return;
            img.src = img.src.replace(/size=\d+/, `size=${emojiUrlSize}`);
        });
    }

    function createSettingsPanel() {
        let html = `
    <div style="margin: 15% auto; padding: 20px; border: 1px solid; width: 80%; background: black;">
        <p style="color: white;">Resizable Emojis Configuration</p>
        <textarea style="width: 100%; height: 100px;"></textarea>
        <button type="button" name="save">Save</input>
        <button type="button" name="cancel">Cancel</input>
    </div>
`;
        let div = document.createElement('div');
        div.innerHTML = html;

        div.querySelector('textarea').value = JSON.stringify(settings, null, 2);

        div.querySelector('button[name="save"]').onclick = async () => {
            let settings_text = div.querySelector('textarea').value;
            settings = await saveSettingsToStorage(settings_text);
            configure();
            reload();
        };

        div.querySelector('button[name="cancel"]').onclick = () => {
            div.querySelector('textarea').value = JSON.stringify(settings, null, 2);
        };

        return div;
    }

    // Platform-dependent functions
    var reload;
    var loadSettingsFromStorage; // async
    var saveSettingsToStorage; // async

    if (typeof BdApi === 'function') { // BetterDiscord plugin
        const pluginName = 'ResizableEmojis';

        const start = () => BdApi.injectCSS(pluginName, css);
        const stop = () => BdApi.clearCSS(pluginName);

        module.exports = () => ({
            start: start,
            stop: stop,
            observer: processMutation,
            getSettingsPanel: createSettingsPanel
        });

        reload = () => {
            stop();
            start();
        };

        loadSettingsFromStorage = async () => {
            settings = Object.assign({}, defaultSettings, BdApi.loadData(pluginName, "settings"));
        };

        saveSettingsToStorage = async (jsonString) => {
            try {
                let jobj = JSON.parse(jsonString);
                BdApi.saveData(pluginName, "settings", jobj);
                BdApi.showToast('Settings saved!', { type: 'success' });
                return jobj;
            } catch (e) {
                BdApi.showToast('Settings are invalid. Not saving.', { type: 'error' });
                return settings;
            }
        };
    } else { // userscript
        const addSettingsMenu = async (element) => {
            // Only act on the settings menu.
            let sideBar = element.querySelector('*[class*="side-"]');
            if (sideBar === null) return;
            // Find the last menu item in the App Settings section.
            let appSettingsHeader = Array.from(sideBar.querySelectorAll('*[class*="header-"]')).find(e => e.textContent === 'App Settings');
            let finalItem = appSettingsHeader.nextElementSibling;
            while (hasClassPrefix(finalItem.nextElementSibling, 'item-')) {
                finalItem = finalItem.nextElementSibling;
            }
            // Add a new menu item at the end.
            let newItem = finalItem.cloneNode();
            newItem.textContent = 'Resizable Emojis';
            finalItem.after(newItem);

            newItem.onclick = () => {
                let dialog = document.body.appendChild(createSettingsPanel());
                dialog.style.display = 'block';
                dialog.style.position = 'fixed';
                dialog.style.zIndex = '1000';
                dialog.style.left = '0';
                dialog.style.top = '0';
                dialog.style.width = '100%';
                dialog.style.height = '100%';
                dialog.style.overflow = 'auto';
                dialog.style.backgroundColor = 'rgba(0,0,0,0.4)';

                dialog.querySelector('button[name="save"]').addEventListener('click',
                    () => {
                        dialog.remove();
                    });
                dialog.querySelector('button[name="cancel"]').addEventListener('click',
                    () => {
                        dialog.remove();
                    });
            };
        };

        const mutationObserverOnChatContent = new MutationObserver(async mutations => {
            for (const mutation of mutations) {
                processMutation(mutation);

                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    await addSettingsMenu(node);
                }
            }
        });
        mutationObserverOnChatContent.observe(document.body, { childList: true, subtree: true });

        var cssElement;
        var add_style = () => {
            cssElement = document.createElement('style');
            cssElement.setAttribute('type', 'text/css');

            if ('textContent' in cssElement) {
                cssElement.textContent = css;
            } else {
                cssElement.styleSheet.cssText = css;
            }

            document.head.appendChild(cssElement);
        };

        reload = () => {
            if (typeof cssElement !== 'undefined') cssElement.remove();
            add_style();
        };

        loadSettingsFromStorage = async () => {
            try {
                settings = JSON.parse(await GM.getValue('settings'));
            } catch (e) { }
        };

        saveSettingsToStorage = async (jsonString) => {
            try {
                let jobj = JSON.parse(jsonString);
                await GM.setValue('settings', jsonString);
                return jobj;
            } catch (e) { }
        };
    }

    await loadSettingsFromStorage();
    configure();
})();