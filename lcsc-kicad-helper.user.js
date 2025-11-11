// ==UserScript==
// @name         立创商城 x KiCad助手 v1
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  一键复制：品牌、型号、编号、描述，可直接粘贴到 KiCad 符号属性中，提升工作效率！
// @author       laowang
// @match        https://item.szlcsc.com/*
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    function extractAllInfo() {
        const info = {
            // 基础信息（主区域）
            brand: '', model: '', sku: '',
        };

        const mainInfo = document.querySelector('section[data-anchor-id="pd"] > div.w-\\[460px\\]');
        if (mainInfo) {
            const dtList = mainInfo.querySelectorAll('dt');
            dtList.forEach(dt => {
                const label = dt.textContent.trim();
                const dd = dt.nextElementSibling;
                if (!dd) return;
                const val = dd.querySelector('a')?.textContent.trim() || dd.textContent.trim();
                switch (label) {
                    case '品牌名称': info.brand = val; break;
                    case '商品型号': info.model = val; break;
                    case '商品编号': info.sku = val; break;
                }
            });
        }

        return info;
    }

    function cleanText(str) {
        return (str || '').trim().replace(/\u200b/g, ''); // 清除零宽空格
    }


    function extractAllParams() {
        const params = [];
        // 查找所有参数表格（支持分栏）
        const tables = document.querySelectorAll('section[data-anchor-id="cs"] table');
        tables.forEach(table => {
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 3) {
                    const attr = cleanText(tds[1]?.textContent);
                    let value = cleanText(tds[2]?.textContent);
                    // 过滤无意义值
                    if (!attr || !value || value === '-' || value === '—' || value === '无') return;
                    // 有些值含换行/多余空格，进一步清理
                    value = value.replace(/\s+/g, ' ');
                    params.push({ attr, value });
                }
            });
        });
        return params;
    }

    function formatText(info) {

        var result = "";

        var description ="";
        var params = extractAllParams();

        // 🔹 参数详情
        if (params.length > 0) {
            params.forEach(p => description=description.concat(`${p.attr}:${p.value}; `) );
        }

        description=description.substring(0, description.length - 2); // 去掉最后的分号和空格
        description=description.replace('商品目录:', '');

        if (info.brand && info.model && info.sku) {
            result = `MPN\t${info.model}\t0\t0\t居中\t居中\t0\t0\nVDR\t${info.brand}\t0\t0\t居中\t居中\t0\t0\nLCN\t${info.sku}\t0\t0\t居中\t居中\t0\t0\nDesc\t${description}\t0\t0\t居中\t居中\t0\t0`;
        }

        return result;
    }

    function addCopyButton() {
        const mainInfo = document.querySelector('section[data-anchor-id="pd"] > div.w-\\[460px\\]');
        if (!mainInfo || document.getElementById('copy-all-btn-container')) return false;
        // 定位主信息区域
        const titleElem = mainInfo.querySelector('h1');
        if (!titleElem) return false;

        const container = document.createElement('span');
        container.id = 'copy-all-btn-container';
        container.style.cssText = 'display:inline-flex;align-items:center;margin-left:12px;gap:6px;';

        // 主按钮
        const btn = document.createElement('button');
        btn.textContent = '复制到KiCad';
        btn.style.cssText = `
            background: #e047a8ff;
            color: white;
            border: none;
            padding: 6px 14px;
            border-radius: 4px;
            font-size: 13px;
            font-weight: 400;
            cursor: pointer;
            white-space: nowrap;
            transition: opacity 0.2s;
        `;
        btn.onmouseenter = () => btn.style.opacity = '0.9';
        btn.onmouseleave = () => btn.style.opacity = '1';

        container.appendChild(btn);

        titleElem.parentNode.insertBefore(container, titleElem.nextSibling);

        btn.addEventListener('click', () => {
            try {
                const info = extractAllInfo();
                const text = formatText(info);
                console.log('[复制内容]', text);

                const success = () => {
                    btn.textContent = '✅ 已复制';
                    setTimeout(() => btn.textContent = '复制到KiCad', 1500);
                };

                if (typeof GM_setClipboard === 'function') {
                    GM_setClipboard(text);
                    success();
                } else {
                    navigator.clipboard.writeText(text).then(success).catch(() => {
                        alert('⚠️ 剪贴板权限被拒，请手动复制或允许权限');
                    });
                }

            } catch (e) {
                console.error('[复制失败]', e);
                alert('复制异常，请反馈');
            }
        });

        console.log('[KiCad助手] 按钮注入成功');
        return true;
    }

    let attempts = 0;
    const max = 20;
    function tryAdd() {
        if (addCopyButton()) return;
        if (++attempts < max) setTimeout(tryAdd, 300);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryAdd);
    } else {
        tryAdd();
    }

    const obs = new MutationObserver(() => {
        if (!document.getElementById('copy-all-btn-container')) tryAdd();
    });
    obs.observe(document.body, { childList: true, subtree: true });
})();

