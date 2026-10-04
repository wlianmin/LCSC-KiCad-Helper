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

    const DIAGNOSTIC_PREFIX = '[KiCad助手诊断]';
    let diagnosticLogged = false;

    function logDiagnostics(reason) {
        if (diagnosticLogged) return;
        const pdSection = document.querySelector('section[data-anchor-id="pd"]');
        const csSection = document.querySelector('section[data-anchor-id="cs"]');
        const legacyMain = pdSection?.querySelector('div.w-\\[460px\\]');
        const headings = [...document.querySelectorAll('h1')]
            .map(el => el.textContent.trim())
            .filter(Boolean)
            .slice(0, 3);
        const bodyText = document.body?.innerText?.replace(/\\s+/g, ' ').trim() || '';
        const isWafPage = /aliyun.?waf|安全验证|访问验证|challenge/i.test(
            `${document.title} ${bodyText} ${document.documentElement.innerHTML.slice(0, 3000)}`
        );
        console.warn(DIAGNOSTIC_PREFIX, {
            reason,
            url: location.href,
            readyState: document.readyState,
            title: document.title,
            pdSection: Boolean(pdSection),
            csSection: Boolean(csSection),
            legacyMain: Boolean(legacyMain),
            h1: headings,
            tables: document.querySelectorAll('table').length,
            isWafPage,
        });
        diagnosticLogged = true;
    }

    function extractAllInfo() {
        const info = {
            // 基础信息（主区域）
            brand: '', model: '', sku: '',
        };

        const roots = [
            ...document.querySelectorAll('section, main, article, [class*="detail"], [class*="product"]'),
            document.body,
        ];
        const labels = { '品牌名称': 'brand', '商品型号': 'model', '商品编号': 'sku' };
        const getValue = labelElement => {
            const candidates = [
                labelElement.nextElementSibling,
                labelElement.parentElement?.nextElementSibling,
                labelElement.closest('tr, li, dt, dd, [class*="item"], [class*="row"]'),
            ].filter(Boolean);
            for (const candidate of candidates) {
                const direct = candidate.querySelector?.('a, [class*="value"], [class*="content"]');
                const value = cleanText(direct?.textContent || candidate.textContent);
                const labelText = cleanText(labelElement.textContent);
                if (value && value.includes(labelText)) {
                    const stripped = cleanText(value.replace(labelText, ''))
                        .replace(/^[：:]\s*/, '');
                    if (stripped) return stripped;
                } else if (candidate !== labelElement && value) {
                    return value;
                }
            }
            return '';
        };
        roots.some(root => {
            const elements = root.querySelectorAll('dt, th, label, [class*="label"], [class*="name"]');
            let found = false;
            elements.forEach(labelElement => {
                const label = cleanText(labelElement.textContent).replace(/[：:]/g, '');
                const key = labels[label];
                if (!key || info[key]) return;
                const val = getValue(labelElement);
                if (val) {
                    info[key] = val;
                    found = true;
                }
            });
            return found && info.brand && info.model && info.sku;
        });

        // 新版页面可能将基础信息渲染成普通文本行，而不是 dt/dd。
        if (!info.brand || !info.model || !info.sku) {
            const text = document.body?.innerText || '';
            Object.entries(labels).forEach(([label, key]) => {
                if (info[key]) return;
                const match = text.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`));
                if (match) info[key] = cleanText(match[1]);
            });
        }

        return info;
    }

    function cleanText(str) {
        return (str || '').trim().replace(/\u200b/g, ''); // 清除零宽空格
    }


    function extractAllParams() {
        const params = [];
        // 只读取商品参数区域，避免把“替代料”等推荐表格识别为参数。
        const tables = document.querySelectorAll(
            '#productParamsTabItem table, section[data-anchor-id="cs"] table'
        );
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr');
            rows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length >= 2) {
                    // 兼容旧版三列（序号/属性/值）和新版两列（属性/值）。
                    const offset = tds.length >= 3 ? 1 : 0;
                    const attr = cleanText(tds[offset]?.textContent);
                    let value = cleanText(tds[offset + 1]?.textContent);
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
        const mainInfo = document.querySelector('section[data-anchor-id="pd"] > div.w-\\[460px\\]')
            || document.querySelector('main, article, [class*="product-detail"], [class*="product-info"]')
            || document.body;
        if (!mainInfo || document.getElementById('copy-all-btn-container')) {
            logDiagnostics('页面主体未找到');
            return false;
        }
        // 定位主信息区域
        const titleElem = mainInfo.querySelector('h1') || document.querySelector('h1');
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
        else logDiagnostics('达到初始重试上限');
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
