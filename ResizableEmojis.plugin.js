// ==UserScript==
// @name         Discord: resizable, high quality emojis
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Enlarges and loads higher resolution versions of emojis on Discord
// @author       Corrodias
// @match        https://discord.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=discord.com
// @grant        GM.setValue
// @grant        GM.getValue
// @license      MIT
// ==/UserScript==

(async function() {
    'use strict';

    const validEmojiSizes = [16, 32, 48, 64, 80, 96, 128]

    var newEmojiSize;
    var newPickerWidth;
    var newPickerHeight;

    const defaultSettings = {
        newEmojiSize: 64,
        newPickerWidth: 1010,
        newPickerHeight: 600
    }
    let settings = {}
    try {
        settings = JSON.parse(await GM.getValue('settings'));
    } catch(e) {}
    if (!settings) settings = {};

    const loadSettings = (settings) => {
        newEmojiSize = settings.newEmojiSize ? isFinite(settings.newEmojiSize) ? settings.newEmojiSize : parseInt(settings.newEmojiSize) : NaN;
        if (isNaN(newEmojiSize)) newEmojiSize = defaultSettings.newEmojiSize;
        newPickerWidth = settings.newPickerWidth ? isFinite(settings.newPickerWidth) ? settings.newPickerWidth : parseInt(settings.newPickerWidth) : NaN;
        if (isNaN(newPickerWidth)) newPickerWidth = defaultSettings.newPickerWidth;
        newPickerHeight = settings.newPickerHeight ? isFinite(settings.newPickerHeight) ? settings.newPickerHeight : parseInt(settings.newPickerHeight) : NaN;
        if (isNaN(newPickerHeight)) newPickerHeight = defaultSettings.newPickerHeight;
    }
    loadSettings(settings);

    let emojiRowWidth = newPickerWidth - 48 - 16; // category panel is 48 wide. there is a margin.
    let emojiCountPerRow = Math.floor(emojiRowWidth / (newEmojiSize + 8)); // each emoji button has an 8px margin.
    // this is how many emojis we want to fit in the row. now, calculate the desired width of the panel so that this number of 48px buttons fit (used to be 40px).
    // this is because the grid layout code for the panel chooses how many buttons to put on each row based on its width, assuming original-sized buttons.
    let initialPanelWidth = (emojiCountPerRow * 48) + 48 + 16;
    // Find the smallest, valid URL size we can get away with for the desired emoji size.
    let emojiUrlSize = validEmojiSizes.find(e => e >= newEmojiSize) ?? 128;

    // .emojiItem-277VFM.emojiItemMedium-2stgkv is the reaction picker buttons
    // .emojiListRowMediumSize-2_-xbz is the grid
    // .emojiItemMedium-2stgkv .image-3tDi44 is the image

    // .emojiImage-1mTIfi is the inline picker when you type a colon

    var css = `
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
`

    const mutationObserverOnChatContent = new MutationObserver(async mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== Node.ELEMENT_NODE) continue;
                replaceAllImageSources(node);
                resizeReactionPicker(node);
                add_settings_menu(node);
            }
        }
    });

    const hasClassPrefix = (element, prefix) => {
        for (let clazz of element.classList.values()) {
            if (clazz.startsWith(prefix)) return true;
        }
        return false;
    }

    const resizeReactionPicker = (element) => {
        // let the CSS give it a default size calculated to insert the correct number of emojis per row.
        // then resize it after it's added, which does NOT alter the number of emojis per row.

        let panel = null;
        if (hasClassPrefix(element, 'emojiPicker-')) panel = element;
        else panel = element.querySelector('div[class*="emojiPicker-"]');

        if (panel === null) return;
        if (hasClassPrefix(panel.parentNode, 'emojiPickerInExpressionPicker-')) return; // do not resize the chat picker, just the reaction picker.

        panel.style.width = newPickerWidth.toString() + 'px';
    }

    const replaceAllImageSources = (element) => {
        element.querySelectorAll('img').forEach(img => {
            // Only replace emojis.
            if (!/^https:\/\/cdn.discordapp.com\/emojis\/.*?\?.*?size=\d+.*$/.test(img.src)) return;
            img.src = img.src.replace(/size=\d+/, `size=${emojiUrlSize}`);
        });
    }

    const add_settings_menu = async (element) => {
        // Only act on the settings menu.
        let side_bar = element.querySelector('.side-2ur1Qk');
        if (side_bar === null) return;
        // Find the last menu item in the App Settings section.
        let app_settings_header = Array.from(side_bar.querySelectorAll('.header-2Kx1US')).find(e => e.textContent === 'App Settings');
        let final_item = app_settings_header.nextElementSibling;
        while (final_item.nextElementSibling.classList.contains('item-3XjbnG')) {
            final_item = final_item.nextElementSibling;
        }
        // Add a new menu item at the end.
        let new_item = final_item.cloneNode();
        new_item.textContent = 'HQ Emojis';
        final_item.after(new_item);
        // Find the content panel.
        let content_panel = Array.from(element.querySelectorAll('.contentColumn-1C7as6')).find(e => e.getAttribute('role') === 'tabpanel');

        new_item.onclick = async () => {
            let dialog = document.body.appendChild(document.createElement('div'));
            dialog.outerHTML = simple_settings_dialog;
            dialog = document.getElementById('hq-emojis-settings-dialog');

            let settings = {
                'newEmojiSize': newEmojiSize,
                'newPickerWidth': newPickerWidth,
                'newPickerHeight': newPickerHeight,
            };
            document.getElementById('hq-emojis-settings-text').value = JSON.stringify(settings, null, 2);

            dialog.querySelector('button[name="save"]').onclick = async () => {
                let settings_text = document.getElementById('hq-emojis-settings-text').value;
                await GM.setValue('settings', settings_text);
                try {
                    settings = JSON.parse(settings_text);
                    loadSettings(settings);
                } catch(e) {}
                dialog.remove();
            }
            dialog.querySelector('button[name="cancel"]').onclick = () => {
                dialog.remove();
            }
        };
    }

    const simple_settings_dialog = `
<div id="hq-emojis-settings-dialog" style="display: block; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4);">
    <div style="margin: 15% auto; padding: 20px; border: 1px solid; width: 80%; background: black;">
        <p style="color: white;">HQ Emojis Configuration</p>
        <p style="color: white;">Changes will take effect upon the next page reload.</p>
        <textarea id="hq-emojis-settings-text" style="width: 100%; height: 100px;"></textarea>
        <button type="button" name="save">Save</input>
        <button type="button" name="cancel">Cancel</input>
    </div>
</div>`;

    const add_style = () => {
        let element = document.createElement('style');
        element.setAttribute('type', 'text/css');

        if ('textContent' in element) {
            element.textContent = css;
        } else {
            element.styleSheet.cssText = css;
        }

        document.head.appendChild(element);
    }

    add_style();

    // Monitor each HTML element that gets added to the HTML body element, since the page takes some time to load and dynamically add its content.
    mutationObserverOnChatContent.observe(document.body, { childList: true, subtree: true });
})();