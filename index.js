(() => {
    'use strict';

    const LOG_TAG = '[Preset Renamer]';
    const STORAGE_KEY = 'preset_renamer_last_type';

    const $ = globalThis.jQuery;
    const SillyTavern = globalThis.SillyTavern;
    const toastr = globalThis.toastr;

    const PRESET_TYPES = [
        { id: 'kobold', label: 'Kobold / Horde 采样预设' },
        { id: 'novel', label: 'NovelAI 预设' },
        { id: 'textgenerationwebui', label: 'Text Completion 预设' },
        { id: 'openai', label: 'Chat Completion 预设' },
        { id: 'context', label: '上下文模板 (Context)' },
        { id: 'instruct', label: '指令模板 (Instruct)' },
        { id: 'sysprompt', label: '系统提示词 (System Prompt)' },
        { id: 'reasoning', label: '推理格式 (Reasoning)' },
    ];

    const ADVANCED_API_IDS = new Set(['context', 'instruct', 'sysprompt', 'reasoning']);

    // 显示名称存储在文件内部 name 字段的预设类型（重命名时必须同步改写该字段）。
    const INNER_NAME_APIS = new Set(['context', 'instruct', 'sysprompt', 'reasoning']);

    // 无法通过公开接口更新当前预设名称指针的类型，拒绝重命名其当前激活预设。
    const ACTIVE_POINTER_UNSUPPORTED_APIS = new Set(['kobold', 'novel']);

    const TEXT_FIELD_LABELS = {
        'content': '主要文本 / content',
        'post_history': '后置历史文本 / post_history',
        'story_string': '故事串联模板 / story_string',
        'example_separator': '示例分隔符 / example_separator',
        'chat_start': '对话开始符 / chat_start',
        'input_sequence': '输入序列 / input_sequence',
        'output_sequence': '输出序列 / output_sequence',
        'first_output_sequence': '首次输出序列 / first_output_sequence',
        'last_output_sequence': '末次输出序列 / last_output_sequence',
        'system_sequence': '系统序列 / system_sequence',
        'first_input_sequence': '首次输入序列 / first_input_sequence',
        'last_input_sequence': '末次输入序列 / last_input_sequence',
        'system_suffix': '系统后缀 / system_suffix',
        'input_suffix': '输入后缀 / input_suffix',
        'output_suffix': '输出后缀 / output_suffix',
        'user_alignment_message': '用户对齐消息 / user_alignment_message',
        'stop_sequence': '停止序列 / stop_sequence',
        'activation_regex': '激活正则 / activation_regex',
        'negative_prompt': '负向提示词 / negative_prompt',
        'grammar_string': '语法约束 / grammar_string',
        'banned_tokens': '禁用 token / banned_tokens',
        'impersonation_prompt': '扮演提示词 / impersonation_prompt',
        'new_chat_prompt': '新对话提示词 / new_chat_prompt',
        'new_group_chat_prompt': '新群聊提示词 / new_group_chat_prompt',
        'new_example_chat_prompt': '示例对话提示词 / new_example_chat_prompt',
        'continue_nudge_prompt': '续写提示词 / continue_nudge_prompt',
        'send_if_empty': '空消息发送内容 / send_if_empty',
    };

    const API_TEXT_KEYS = {
        'context': ['story_string', 'example_separator', 'chat_start'],
        'instruct': [
            'input_sequence', 'output_sequence', 'first_output_sequence', 'last_output_sequence',
            'system_sequence', 'first_input_sequence', 'last_input_sequence', 'system_suffix',
            'input_suffix', 'output_suffix', 'user_alignment_message', 'stop_sequence', 'activation_regex',
        ],
        'sysprompt': ['content', 'post_history'],
        'reasoning': ['prefix', 'suffix', 'separator'],
        'openai': [
            'impersonation_prompt', 'new_chat_prompt', 'new_group_chat_prompt',
            'new_example_chat_prompt', 'continue_nudge_prompt', 'send_if_empty',
        ],
    };

    const API_CONFIG_KEYS = {
        'context': [
            'story_string_position', 'story_string_depth', 'story_string_role',
            'use_stop_strings', 'names_as_stop_strings', 'always_force_name2',
            'trim_sentences', 'single_line',
        ],
        'instruct': [
            'wrap', 'macro', 'names_behavior', 'skip_examples',
            'sequences_as_stop_strings', 'system_same_as_user',
        ],
        'sysprompt': [],
        'reasoning': [],
        'openai': [
            'chat_completion_source', 'openai_model', 'claude_model', 'openrouter_model',
            'google_model', 'vertexai_model', 'temperature', 'frequency_penalty', 'presence_penalty',
            'top_p', 'top_k', 'top_a', 'min_p', 'openai_max_context', 'openai_max_tokens',
            'names_behavior', 'bias_preset_selected',
        ],
        'textgenerationwebui': [
            'temp', 'top_p', 'top_k', 'top_a', 'tfs', 'min_p', 'typical_p',
            'rep_pen', 'freq_pen', 'presence_pen', 'penalty_alpha', 'guidance_scale',
            'do_sample', 'mirostat_mode', 'mirostat_tau', 'mirostat_eta',
            'samplers', 'sampler_priority',
        ],
        'kobold': [
            'temp', 'top_p', 'top_k', 'top_a', 'tfs', 'min_p', 'typical',
            'rep_pen', 'rep_pen_range', 'rep_pen_slope', 'do_sample',
        ],
        'novel': [
            'temperature', 'top_p', 'top_k', 'min_p', 'typical_p',
            'max_length', 'min_length', 'max_context',
            'repetition_penalty', 'repetition_penalty_range', 'repetition_penalty_slope',
            'repetition_penalty_frequency', 'repetition_penalty_presence',
        ],
    };

    const FALLBACK_CONFIG_KEYS = [
        'temp', 'temperature', 'top_p', 'top_k', 'top_a', 'min_p', 'typical_p',
        'rep_pen', 'frequency_penalty', 'presence_penalty', 'max_context', 'max_length',
        'openai_model', 'claude_model', 'openrouter_model', 'chat_completion_source',
    ];

    const SENSITIVE_KEY_PATTERN = /password|passwd|api[_-]?key|token|secret|authorization|proxy/i;

    const state = {
        apiId: null,
        search: '',
        selected: new Set(),
        initialized: false,
        applying: false,
        batchNames: [],
        batchMode: 'prefix',
    };

    let $root = null;
    let $list = null;
    let $typeSelect = null;
    let $searchInput = null;
    let $batchPanel = null;
    let $affixInput = null;
    let $batchPreview = null;
    let $batchErrors = null;
    let $selectionCount = null;
    function getContext() {
        if (SillyTavern && typeof SillyTavern.getContext === 'function') {
            return SillyTavern.getContext();
        }
        return null;
    }

    function getPresetManager(apiId) {
        const context = getContext();
        if (!context || typeof context.getPresetManager !== 'function') {
            return null;
        }
        return context.getPresetManager(apiId || '');
    }

    function hasPresetManager(apiId) {
        return Boolean(getPresetManager(apiId));
    }

    function availableApiIds() {
        const ids = [];
        for (const presetType of PRESET_TYPES) {
            if (hasPresetManager(presetType.id)) {
                ids.push(presetType.id);
            }
        }
        return ids;
    }

    function getManagerOrThrow(apiId = state.apiId) {
        const manager = getPresetManager(apiId);
        if (!manager) {
            throw new Error('当前预设类型没有可用的 PresetManager。');
        }
        return manager;
    }

    function normalizeName(value) {
        let text = String(value == null ? '' : value).trim();
        try {
            text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        } catch {
            // Ignore environments without full Unicode normalization.
        }
        return text.toLocaleLowerCase();
    }

    function isSafeFilename(value) {
        const text = String(value == null ? '' : value).trim();
        if (!text) {
            return '名称不能为空。';
        }
        if (text.length > 240) {
            return '名称过长，请控制在 240 个字符以内。';
        }
        if (/[\\/:*?<>|]/.test(text) || text.indexOf(String.fromCharCode(34)) !== -1) {
            return '名称不能包含斜杠、星号、问号、引号等非法字符。';
        }
        if (text === '.' || text === '..') {
            return '名称无效。';
        }
        if (/[. ]$/.test(text)) {
            return '名称不能以点号或空格结尾。';
        }
        return '';
    }

    function toast(type, message) {
        if (toastr && typeof toastr[type] === 'function') {
            toastr[type](message);
        } else {
            const consoleMethod = type === 'error' ? 'error' : type === 'success' ? 'log' : 'warn';
            console[consoleMethod](LOG_TAG, message);
        }
    }

    function debounce(fn, wait) {
        let timer = null;
        return function debounced(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function storedApiId() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch {
            return null;
        }
    }

    function persistApiId(apiId) {
        try {
            localStorage.setItem(STORAGE_KEY, apiId);
        } catch {
            // Storage can be unavailable; the plugin still works for the current session.
        }
    }
    function buildRoot() {
        if ($('#preset-renamer-container').length) {
            $root = $('#preset-renamer-container');
            cacheDom();
            return;
        }

        const html = `
        <div id='preset-renamer-container' class='preset-renamer-container extension_container'>
            <button type='button' class='menu_button pr-toggle' aria-expanded='false' aria-controls='pr-panel'>
                <span class='pr-toggle-title'>Preset Renamer</span>
                <span class='pr-toggle-state'>展开</span>
            </button>
            <div id='pr-panel' class='pr-panel' hidden>
            <div class='pr-title-row'>
                <div>
                    <div class='pr-title'>Preset Renamer</div>
                    <div class='pr-subtitle'>预览并整理酒馆预设名称，仅修改名称，不改内容。</div>
                </div>
            </div>
            <div class='pr-toolbar'>
                <input type='search' class='text_pole pr-search-input' placeholder='搜索预设名称（不区分大小写）' />
                <select class='text_pole pr-type-select' aria-label='预设类型'></select>
            </div>
            <div class='pr-toolbar pr-selection-toolbar'>
                <button type='button' class='menu_button pr-select-all' title='选择当前筛选结果'>全选</button>
                <button type='button' class='menu_button pr-deselect-all' title='清除所有选择'>取消全选</button>
                <span class='pr-selection-count'>已选择：0</span>
                <button type='button' class='menu_button pr-open-batch'>批量重命名</button>
            </div>
            <div class='pr-batch-panel' hidden>
                <div class='pr-batch-heading'>批量重命名</div>
                <div class='pr-batch-options'>
                    <label class='pr-radio-label'>
                        <input type='radio' name='pr-batch-mode' value='prefix' checked />
                        <span>添加前缀</span>
                    </label>
                    <label class='pr-radio-label'>
                        <input type='radio' name='pr-batch-mode' value='suffix' />
                        <span>添加后缀</span>
                    </label>
                </div>
                <div class='pr-affix-row'>
                    <label class='pr-field-label' for='pr-affix-input'>前缀 / 后缀内容</label>
                    <input id='pr-affix-input' type='text' class='text_pole pr-affix-input' placeholder='例如：RP-' />
                </div>
                <div class='pr-batch-errors' role='alert' hidden></div>
                <div class='pr-batch-preview-title'>预览：</div>
                <div class='pr-batch-preview'></div>
                <div class='pr-batch-actions'>
                    <button type='button' class='menu_button pr-batch-cancel'>取消</button>
                    <button type='button' class='menu_button pr-batch-apply'>应用修改</button>
                </div>
            </div>
            <div class='pr-list' aria-live='polite'></div>
            </div>
        </div>`;

        $root = $(html);
        const mountTarget = $('#extensions_settings').length ? $('#extensions_settings') : $('body');
        mountTarget.append($root);
        cacheDom();
    }

    function cacheDom() {
        $list = $root.find('.pr-list');
        $typeSelect = $root.find('.pr-type-select');
        $searchInput = $root.find('.pr-search-input');
        $batchPanel = $root.find('.pr-batch-panel');
        $affixInput = $root.find('.pr-affix-input');
        $batchPreview = $root.find('.pr-batch-preview');
        $batchErrors = $root.find('.pr-batch-errors');
        $selectionCount = $root.find('.pr-selection-count');
    }

    function bindEvents() {
        $root.on('click', '.pr-toggle', function () {
            const $panel = $root.find('.pr-panel');
            const expanded = !$panel.prop('hidden');
            $panel.prop('hidden', expanded);
            $(this).attr('aria-expanded', String(!expanded));
            $(this).find('.pr-toggle-state').text(expanded ? '展开' : '收起');
        });

        $root.on('input', '.pr-search-input', function () {
            state.search = $(this).val() || '';
            renderPresetList();
        });

        $root.on('change', '.pr-type-select', function () {
            state.apiId = $(this).val() || null;
            persistApiId(state.apiId);
            state.selected.clear();
            closeBatchPanel();
            renderTypeOptions();
            renderPresetList();
        });

        $root.on('change', '.pr-row-checkbox', function () {
            const name = $(this).closest('.pr-row').attr('data-preset-name');
            if ($(this).prop('checked')) {
                state.selected.add(name);
            } else {
                state.selected.delete(name);
            }
            updateSelectionCount();
        });

        $root.on('click', '.pr-select-all', function () {
            $list.find('.pr-row').each(function () {
                const name = $(this).attr('data-preset-name');
                state.selected.add(name);
                $(this).find('.pr-row-checkbox').prop('checked', true);
            });
            updateSelectionCount();
        });

        $root.on('click', '.pr-deselect-all', function () {
            state.selected.clear();
            $list.find('.pr-row-checkbox').prop('checked', false);
            updateSelectionCount();
        });

        $root.on('click', '.pr-row-preview', function () {
            const name = $(this).closest('.pr-row').attr('data-preset-name');
            openPreviewModal(name);
        });

        $root.on('click', '.pr-row-rename', function () {
            const name = $(this).closest('.pr-row').attr('data-preset-name');
            openSingleRenameModal(name);
        });

        $root.on('click', '.pr-open-batch', function () {
            openBatchPanel();
        });

        $root.on('click', '.pr-batch-cancel', closeBatchPanel);
        $root.on('click', '.pr-batch-apply', applyBatchRename);

        $root.on('change', 'input[name=pr-batch-mode]', function () {
            state.batchMode = $(this).val();
            updateBatchModeVisibility();
            renderBatchPreview();
        });

        $root.on('input', '.pr-affix-input', renderBatchPreview);
    }
    function bindGlobalEvents() {
        const context = getContext();
        if (!context || !context.eventSource || !context.eventTypes) {
            return;
        }

        const refresh = debounce(() => {
            if (state.applying) {
                return;
            }
            renderTypeOptions();
            renderPresetList();
        }, 150);

        const eventNames = [
            context.eventTypes.SETTINGS_LOADED,
            context.eventTypes.SETTINGS_LOADED_AFTER,
            context.eventTypes.EXTENSIONS_FIRST_LOAD,
            context.eventTypes.PRESET_CHANGED,
            context.eventTypes.PRESET_DELETED,
            context.eventTypes.PRESET_RENAMED,
            context.eventTypes.MAIN_API_CHANGED,
        ];

        for (const eventName of eventNames) {
            if (eventName) {
                context.eventSource.on(eventName, refresh);
            }
        }
    }

    function chooseInitialApiId() {
        const stored = storedApiId();
        if (stored && hasPresetManager(stored)) {
            state.apiId = stored;
            return;
        }

        const context = getContext();
        let mainApi = context && context.mainApi ? context.mainApi : '';
        if (mainApi === 'koboldhorde') {
            mainApi = 'kobold';
        }
        if (mainApi && hasPresetManager(mainApi)) {
            state.apiId = mainApi;
            return;
        }

        const firstAvailable = PRESET_TYPES.find(presetType => hasPresetManager(presetType.id));
        state.apiId = firstAvailable ? firstAvailable.id : null;
    }

    function renderTypeOptions() {
        $typeSelect.empty();
        const ids = availableApiIds();
        if (!ids.length) {
            $typeSelect.append($('<option></option>', {
                value: '',
                text: '当前没有可用预设',
            }));
            return;
        }

        for (const presetType of PRESET_TYPES) {
            if (!ids.includes(presetType.id)) {
                continue;
            }
            const option = $('<option></option>', {
                value: presetType.id,
                text: presetType.label,
            });
            if (presetType.id === state.apiId) {
                option.prop('selected', true);
            }
            $typeSelect.append(option);
        }
    }

    function getCurrentManager() {
        return getPresetManager(state.apiId);
    }

    function getPresetNamesForCurrentManager() {
        const manager = getCurrentManager();
        if (!manager) {
            return [];
        }
        if (typeof manager.getAllPresets === 'function') {
            const names = manager.getAllPresets();
            return Array.isArray(names) ? names.filter(name => typeof name === 'string' && name.trim()) : [];
        }

        const list = getPresetListCompat(manager);
        if (!list) {
            return [];
        }
        const presetNames = list.preset_names;
        if (Array.isArray(presetNames)) {
            return presetNames.filter(name => typeof name === 'string' && name.trim());
        }
        if (presetNames && typeof presetNames === 'object') {
            return Object.keys(presetNames);
        }
        return [];
    }

    function getPresetListCompat(manager) {
        if (!manager || typeof manager.getPresetList !== 'function') {
            return null;
        }
        return manager.getPresetList() || null;
    }

    function getPresetByNameCompat(manager, name) {
        if (!manager) {
            return undefined;
        }
        if (typeof manager.getCompletionPresetByName === 'function') {
            const preset = manager.getCompletionPresetByName(name);
            if (preset !== undefined) {
                return preset;
            }
        }

        const list = getPresetListCompat(manager);
        if (!list || !list.presets || !list.preset_names) {
            return undefined;
        }
        const presets = list.presets;
        const presetNames = list.preset_names;
        if (Array.isArray(presetNames)) {
            const index = presetNames.indexOf(name);
            return index >= 0 ? presets[index] : undefined;
        }
        const index = presetNames[name];
        return index !== undefined ? presets[index] : undefined;
    }
    function renderPresetList() {
        const manager = getCurrentManager();
        if (!manager) {
            $list.empty();
            $list.append($('<div></div>', {
                class: 'pr-empty',
                text: '当前没有可用的预设管理器。',
            }));
            updateSelectionCount();
            return;
        }

        const allNames = getPresetNamesForCurrentManager();
        const query = state.search.trim().toLocaleLowerCase();
        const visibleNames = allNames.filter(name => !query || name.toLocaleLowerCase().includes(query));

        $list.empty();

        if (!visibleNames.length) {
            const message = allNames.length
                ? '没有符合搜索条件的预设。'
                : '该类型下暂无预设。';
            $list.append($('<div></div>', { class: 'pr-empty', text: message }));
            updateSelectionCount();
            return;
        }

        for (const name of visibleNames) {
            $list.append(createPresetRow(name, state.selected.has(name)));
        }
        updateSelectionCount();
    }

    function createPresetRow(name, selected) {
        const $row = $('<div></div>', {
            class: 'pr-row',
            'data-preset-name': name,
        });

        const $checkbox = $('<input>', {
            type: 'checkbox',
            class: 'pr-row-checkbox',
            title: '选择 ' + name,
        }).prop('checked', selected);

        const $checkboxLabel = $('<label></label>', {
            class: 'pr-checkbox-label',
        }).append($checkbox);

        const $name = $('<div></div>', {
            class: 'pr-name',
            title: name,
        }).text(name);

        const $actions = $('<div></div>', {
            class: 'pr-row-actions',
        });

        const $previewButton = $('<button></button>', {
            type: 'button',
            class: 'menu_button pr-btn pr-row-preview',
            text: '预览',
        });

        const $renameButton = $('<button></button>', {
            type: 'button',
            class: 'menu_button pr-btn pr-row-rename',
            text: '重命名',
        });

        $actions.append($previewButton, $renameButton);
        $row.append($checkboxLabel, $name, $actions);
        return $row;
    }

    function updateSelectionCount() {
        const count = state.selected.size;
        $selectionCount.text('已选择：' + count);
        $root.find('.pr-open-batch').prop('disabled', count === 0 || state.applying);
    }

    function selectedNamesInCurrentOrder() {
        const allNames = getPresetNamesForCurrentManager();
        return allNames.filter(name => state.selected.has(name));
    }

    function openPreviewModal(name) {
        let preset;
        try {
            const manager = getManagerOrThrow();
            preset = getPresetByNameCompat(manager, name);
        } catch (error) {
            toast('error', error.message);
            return;
        }

        if (!preset || typeof preset !== 'object') {
            toast('warning', '找不到预设：' + name);
            return;
        }

        const body = buildPreviewBody(state.apiId, name, preset);
        showModal('预设预览：' + name, body, true);
    }

    async function openSingleRenameModal(oldName) {
        const newName = await promptForNewName(oldName);
        if (newName === null) {
            return;
        }
        if (normalizeName(newName) === normalizeName(oldName)) {
            toast('info', '名称没有变化。');
            return;
        }

        try {
            await renamePreset(state.apiId, oldName, newName);
            state.selected.delete(oldName);
            state.selected.add(newName);
            toast('success', '已重命名为：' + newName);
        } catch (error) {
            toast('error', error.message || '重命名失败。');
        } finally {
            renderPresetList();
        }
    }

    function getPresetNamesFromManager(manager) {
        if (!manager) {
            return [];
        }
        if (typeof manager.getAllPresets === 'function') {
            const names = manager.getAllPresets();
            return Array.isArray(names)
                ? names.filter(name => typeof name === 'string' && name.trim())
                : [];
        }

        const list = getPresetListCompat(manager);
        if (!list) {
            return [];
        }

        const presetNames = list.preset_names;
        if (Array.isArray(presetNames)) {
            return presetNames.filter(name => typeof name === 'string' && name.trim());
        }
        if (presetNames && typeof presetNames === 'object') {
            return Object.keys(presetNames);
        }
        return [];
    }

    function getPreviewKeys(apiId) {
        const keys = [];
        const seen = new Set();
        const addKeys = (list) => {
            if (!Array.isArray(list)) {
                return;
            }
            for (const key of list) {
                if (!key || seen.has(key)) {
                    continue;
                }
                seen.add(key);
                keys.push(key);
            }
        };

        addKeys(API_TEXT_KEYS[apiId]);
        if (Array.isArray(API_CONFIG_KEYS[apiId]) && API_CONFIG_KEYS[apiId].length) {
            addKeys(API_CONFIG_KEYS[apiId]);
        } else {
            addKeys(FALLBACK_CONFIG_KEYS);
        }
        return keys;
    }

    function formatPresetValue(key, value) {
        if (value === undefined || value === null || value === '') {
            return '<span class="pr-missing">（未设置）</span>';
        }

        if (SENSITIVE_KEY_PATTERN.test(key) && String(value).length) {
            return '<code class="pr-sensitive">' + escapeHtml('********') + '</code>';
        }

        let text;
        if (typeof value === 'object') {
            try {
                text = JSON.stringify(value, null, 2);
            } catch {
                text = String(value);
            }
        } else {
            text = String(value);
        }

        if (text.length > 8000) {
            text = text.slice(0, 8000) + '\n…';
        }
        return '<pre class="pr-value-pre">' + escapeHtml(text) + '</pre>';
    }

    function buildPreviewBody(apiId, name, preset) {
        const promptEntries = getPresetPromptEntries(preset);
        const rows = [
            '<div class="pr-preview-row">',
            '  <div class="pr-preview-key">预设名称</div>',
            '  <div class="pr-preview-value">' + escapeHtml(name) + '</div>',
            '</div>',
        ];

        if (promptEntries.length) {
            rows.push(
                '<div class="pr-preview-row">',
                '  <div class="pr-preview-key">Prompt 条目</div>',
                '  <div class="pr-preview-value pr-prompt-count">' + promptEntries.length + ' 个</div>',
                '</div>',
                '<div class="pr-prompt-list">' + promptEntries.map((entry, index) => {
                    const statusText = entry.enabled === true ? '启用' : entry.enabled === false ? '停用' : '未知';
                    const statusClass = entry.enabled === true ? 'is-enabled' : entry.enabled === false ? 'is-disabled' : 'is-unknown';
                    const title = entry.name || ('Prompt ' + (index + 1));
                    const content = entry.content === undefined || entry.content === null || entry.content === ''
                        ? '<span class="pr-missing">（无文本内容）</span>'
                        : formatPresetValue('content', entry.content);
                    return '<details class="pr-prompt-item"><summary class="pr-prompt-summary"><span class="pr-prompt-name">' + escapeHtml(title) + '</span><span class="pr-prompt-status ' + statusClass + '">' + statusText + '</span></summary><div class="pr-prompt-content">' + content + '</div></details>';
                }).join('') + '</div>',
            );
            return '<div class="pr-preview">' + rows.join('') + '</div>';
        }

        for (const key of getPreviewKeys(apiId)) {
            const rawValue = preset[key];
            if (rawValue === undefined || rawValue === null || rawValue === '') {
                continue;
            }
            const label = TEXT_FIELD_LABELS[key] || key;
            rows.push(
                '<details class="pr-prompt-item">',
                '  <summary class="pr-prompt-summary"><span class="pr-prompt-name">' + escapeHtml(label) + '</span></summary>',
                '  <div class="pr-prompt-content">' + formatPresetValue(key, rawValue) + '</div>',
                '</details>',
            );
        }

        if (rows.length === 1) {
            rows.push('<div class="pr-preview-empty">该预设没有可预览的字段。</div>');
        }

        return '<div class="pr-preview">' + rows.join('') + '</div>';
    }

    function getPresetPromptEntries(preset) {
        const prompts = getPresetPrompts(preset);
        const orderEntries = getPresetPromptOrder(preset);
        const promptByIdentifier = new Map();

        for (const prompt of prompts) {
            if (!prompt || typeof prompt !== 'object') {
                continue;
            }
            const identifier = getPromptIdentifier(prompt);
            if (identifier !== undefined && identifier !== null && !promptByIdentifier.has(identifier)) {
                promptByIdentifier.set(identifier, prompt);
            }
        }

        const entries = [];
        const usedPrompts = new Set();
        for (const orderEntry of orderEntries) {
            if (!orderEntry || typeof orderEntry !== 'object') {
                continue;
            }
            const identifier = getPromptIdentifier(orderEntry);
            const prompt = identifier === undefined || identifier === null ? undefined : promptByIdentifier.get(identifier);
            if (prompt) {
                usedPrompts.add(prompt);
            }
            const source = prompt || orderEntry;
            const enabled = typeof orderEntry.enabled === 'boolean'
                ? orderEntry.enabled
                : (prompt && typeof prompt.enabled === 'boolean' ? prompt.enabled : undefined);
            entries.push({
                name: getPromptDisplayName(source),
                enabled,
                content: getPromptContent(source),
            });
        }

        for (const prompt of prompts) {
            if (!prompt || typeof prompt !== 'object' || usedPrompts.has(prompt)) {
                continue;
            }
            entries.push({
                name: getPromptDisplayName(prompt),
                enabled: typeof prompt.enabled === 'boolean' ? prompt.enabled : undefined,
                content: getPromptContent(prompt),
            });
        }
        return entries;
    }

    function getPresetPrompts(preset) {
        if (Array.isArray(preset.prompts)) {
            return preset.prompts;
        }
        if (preset.prompts && typeof preset.prompts === 'object') {
            return Object.values(preset.prompts);
        }
        return [];
    }

    function getPresetPromptOrder(preset) {
        const promptOrder = preset.prompt_order;
        if (Array.isArray(promptOrder)) {
            const groups = promptOrder.filter(item => item && Array.isArray(item.order));
            if (groups.length) {
                const selected = groups.find(item => Number(item.character_id) === 100001) || groups[0];
                return selected.order;
            }
            return promptOrder.every(item => item && typeof item === 'object') ? promptOrder : [];
        }

        if (promptOrder && typeof promptOrder === 'object') {
            if (Array.isArray(promptOrder.order)) {
                return promptOrder.order;
            }
            const preferred = promptOrder[100001] || promptOrder['100001'];
            if (Array.isArray(preferred)) {
                return preferred;
            }
            return Object.values(promptOrder).find(Array.isArray) || [];
        }
        return [];
    }

    function getPromptIdentifier(item) {
        return item.identifier !== undefined ? item.identifier : (item.id !== undefined ? item.id : item.name);
    }

    function getPromptDisplayName(item) {
        return item.name || item.identifier || item.id || '';
    }

    function getPromptContent(item) {
        if (item.content !== undefined) {
            return item.content;
        }
        if (item.prompt !== undefined) {
            return item.prompt;
        }
        return item.text;
    }

    function showModal(title, body, wide = false) {
        const $overlay = $('<div></div>', { class: 'pr-modal-backdrop' });
        const $dialog = $('<div></div>', { class: 'pr-modal-dialog' });
        if (wide) {
            $dialog.addClass('pr-modal-wide');
        }

        const $title = $('<div></div>', { class: 'pr-modal-title', text: title });
        const $close = $('<button></button>', {
            type: 'button',
            class: 'pr-modal-close',
            title: '关闭',
            text: '×',
        });
        const $content = $('<div></div>', { class: 'pr-modal-content' }).html(body);

        $dialog.append($title, $close, $content);
        $overlay.append($dialog).appendTo($('body'));

        const close = () => {
            $overlay.remove();
            $(document).off('keydown.pr-modal');
        };
        $close.on('click', close);
        $overlay.on('mousedown', function (event) {
            if (event.target === $overlay[0]) {
                close();
            }
        });
        $(document).on('keydown.pr-modal', function (event) {
            if (event.key === 'Escape') {
                close();
            }
        });
        return close;
    }

    function promptForNewName(oldName) {
        return new Promise((resolve) => {
            const $overlay = $('<div></div>', { class: 'pr-modal-backdrop' });
            const $dialog = $('<div></div>', { class: 'pr-modal-dialog pr-modal-prompt' });
            const $title = $('<div></div>', { class: 'pr-modal-title', text: '重命名预设' });
            const $label = $('<label></label>', { class: 'pr-prompt-label', text: '新名称' });
            const $input = $('<input>', {
                type: 'text',
                class: 'text_pole pr-prompt-input',
            }).val(oldName || '');
            const $hint = $('<div></div>', { class: 'pr-prompt-hint' }).hide();
            const $cancel = $('<button></button>', {
                type: 'button',
                class: 'menu_button pr-modal-cancel',
                text: '取消',
            });
            const $confirm = $('<button></button>', {
                type: 'button',
                class: 'menu_button pr-modal-confirm',
                text: '保存',
            });
            const $actions = $('<div></div>', { class: 'pr-modal-actions' }).append($cancel, $confirm);

            let settled = false;
            const close = (value) => {
                if (settled) {
                    return;
                }
                settled = true;
                $overlay.remove();
                $(document).off('keydown.pr-prompt');
                resolve(value);
            };

            function submit() {
                const rawValue = $input.val();
                const value = String(rawValue == null ? '' : rawValue).trim();
                const error = isSafeFilename(value);
                if (error) {
                    $hint.text(error).show();
                    $input.trigger('focus');
                    return;
                }
                close(value);
            }

            $confirm.on('click', submit);
            $cancel.on('click', () => close(null));
            $input.on('keydown', function (event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    submit();
                } else if (event.key === 'Escape') {
                    close(null);
                }
            });
            $(document).on('keydown.pr-prompt', function (event) {
                if (event.key === 'Escape') {
                    close(null);
                }
            });

            $dialog.append($title, $label, $input, $hint, $actions);
            $overlay.append($dialog).appendTo($('body'));
            setTimeout(() => {
                $input.trigger('focus');
                $input.trigger('select');
            }, 0);
        });
    }

    function deepEqual(a, b) {
        if (Object.is(a, b)) {
            return true;
        }
        if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
            return false;
        }
        if (Array.isArray(a) !== Array.isArray(b)) {
            return false;
        }
        if (Array.isArray(a)) {
            if (a.length !== b.length) {
                return false;
            }
            for (let i = 0; i < a.length; i++) {
                if (!deepEqual(a[i], b[i])) {
                    return false;
                }
            }
            return true;
        }
        const aKeys = Object.keys(a).filter(key => a[key] !== undefined);
        const bKeys = Object.keys(b).filter(key => b[key] !== undefined);
        if (aKeys.length !== bKeys.length) {
            return false;
        }
        for (const key of aKeys) {
            if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) {
                return false;
            }
        }
        return true;
    }

    function parseDiskPresetFromArrays(contents, names, name) {
        if (!Array.isArray(contents) || !Array.isArray(names)) {
            return undefined;
        }
        const index = names.indexOf(name);
        if (index < 0 || index >= contents.length) {
            return undefined;
        }
        try {
            return JSON.parse(contents[index]);
        } catch {
            return undefined;
        }
    }

    function findDiskPresetByName(list, name) {
        if (!Array.isArray(list)) {
            return undefined;
        }
        return list.find(item => item && typeof item === 'object' && item.name === name);
    }

    async function fetchDiskPreset(apiId, name) {
        const context = getContext();
        if (!context || typeof context.getRequestHeaders !== 'function') {
            throw new Error('无法获取请求头。');
        }
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: '{}',
        });
        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }
        const data = await response.json();
        switch (apiId) {
            case 'openai':
                return parseDiskPresetFromArrays(data.openai_settings, data.openai_setting_names, name);
            case 'kobold':
                return parseDiskPresetFromArrays(data.koboldai_settings, data.koboldai_setting_names, name);
            case 'novel':
                return parseDiskPresetFromArrays(data.novelai_settings, data.novelai_setting_names, name);
            case 'textgenerationwebui':
                return parseDiskPresetFromArrays(data.textgenerationwebui_presets, data.textgenerationwebui_preset_names, name);
            case 'instruct':
                return findDiskPresetByName(data.instruct, name);
            case 'context':
                return findDiskPresetByName(data.context, name);
            case 'sysprompt':
                return findDiskPresetByName(data.sysprompt, name);
            case 'reasoning':
                return findDiskPresetByName(data.reasoning, name);
            default:
                return undefined;
        }
    }

    function getLegacyBlockReason(apiId, content) {
        if (apiId === 'instruct' && content.system_prompt) {
            return '该 instruct 预设包含旧版 system_prompt 字段，保存时 SillyTavern 会触发迁移并修改内容。为避免数据变化已拒绝重命名，请先在 SillyTavern 中选中并重新保存该预设完成迁移。';
        }
        if (apiId === 'novel' && content.presetVersion === 3 && content.parameters && typeof content.parameters === 'object') {
            return '该 NovelAI 预设是旧版格式（presetVersion 3），保存时 SillyTavern 会自动转换并修改内容。为避免数据变化已拒绝重命名，请先在 SillyTavern 中选中并重新保存该预设完成格式升级。';
        }
        return '';
    }

    function getActivePointerTarget(apiId) {
        const context = getContext();
        if (!context) {
            return null;
        }
        switch (apiId) {
            case 'openai':
                return context.chatCompletionSettings
                    ? { settings: context.chatCompletionSettings, key: 'preset_settings_openai' }
                    : null;
            case 'textgenerationwebui':
                return context.textCompletionSettings
                    ? { settings: context.textCompletionSettings, key: 'preset' }
                    : null;
            case 'context':
                return context.powerUserSettings && context.powerUserSettings.context
                    ? { settings: context.powerUserSettings.context, key: 'preset' }
                    : null;
            case 'instruct':
                return context.powerUserSettings && context.powerUserSettings.instruct
                    ? { settings: context.powerUserSettings.instruct, key: 'preset' }
                    : null;
            case 'sysprompt':
                return context.powerUserSettings && context.powerUserSettings.sysprompt
                    ? { settings: context.powerUserSettings.sysprompt, key: 'name' }
                    : null;
            case 'reasoning':
                return context.powerUserSettings && context.powerUserSettings.reasoning
                    ? { settings: context.powerUserSettings.reasoning, key: 'name' }
                    : null;
            default:
                return null;
        }
    }

    function getOptionForPreset(manager, name) {
        return $(manager.select).find('option').filter(function () {
            return $(this).text() === name;
        });
    }

    function appendPresetEntry(manager, name, content) {
        const { presets, preset_names } = manager.getPresetList();
        if (!Array.isArray(presets) || !preset_names) {
            throw new Error('内部预设列表不可用。');
        }
        presets.push(content);
        if (Array.isArray(preset_names)) {
            preset_names.push(name);
            $(manager.select).append($('<option></option>', { value: name, text: name }));
        } else {
            preset_names[name] = presets.length - 1;
            $(manager.select).append($('<option></option>', { value: String(presets.length - 1), text: name }));
        }
    }

    function renameEntryInPlace(manager, oldName, newName, content) {
        const { presets, preset_names } = manager.getPresetList();
        if (!Array.isArray(presets) || !preset_names) {
            throw new Error('内部预设列表不可用。');
        }
        if (Array.isArray(preset_names)) {
            const index = preset_names.indexOf(oldName);
            if (index < 0) {
                throw new Error('内部列表中找不到原预设。');
            }
            preset_names[index] = newName;
            presets[index] = content;
            getOptionForPreset(manager, oldName).val(newName).text(newName);
        } else {
            const index = preset_names[oldName];
            if (index === undefined) {
                throw new Error('内部列表中找不到原预设。');
            }
            delete preset_names[oldName];
            preset_names[newName] = index;
            presets[index] = content;
            getOptionForPreset(manager, oldName).text(newName);
        }
    }

    function ensurePresetEntry(manager, name, content) {
        if (getPresetNamesFromManager(manager).includes(name)) {
            return;
        }
        appendPresetEntry(manager, name, content);
    }

    async function postDeletePresetFile(apiId, name) {
        const context = getContext();
        const response = await fetch('/api/presets/delete', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({ name, apiId }),
        });
        return response.ok;
    }

    async function emitRenameEvent(eventTypeKey, payload) {
        try {
            const context = getContext();
            const eventName = context && context.eventTypes ? context.eventTypes[eventTypeKey] : null;
            if (eventName && context.eventSource && typeof context.eventSource.emit === 'function') {
                await context.eventSource.emit(eventName, payload);
            }
        } catch (error) {
            console.warn(LOG_TAG, '重命名事件发送失败（不影响结果）', error);
        }
    }

    async function renamePreset(apiId, oldName, newName) {
        const manager = getManagerOrThrow(apiId);
        const filenameError = isSafeFilename(newName);
        if (filenameError) {
            throw new Error(filenameError);
        }

        const names = getPresetNamesFromManager(manager);
        if (!names.includes(oldName)) {
            throw new Error('找不到目标预设：' + oldName);
        }
        const duplicate = names.find(name => name !== oldName && normalizeName(name) === normalizeName(newName));
        if (duplicate) {
            throw new Error('已存在同名预设：' + duplicate);
        }
        if (normalizeName(newName) === normalizeName(oldName)) {
            return;
        }

        if (typeof manager.getCompletionPresetByName !== 'function'
            || typeof manager.savePreset !== 'function'
            || typeof manager.deletePreset !== 'function'
            || typeof manager.getPresetList !== 'function') {
            throw new Error('当前 SillyTavern 版本不支持后台重命名，已保留原预设。');
        }

        const isActiveTarget = manager.getSelectedPresetName() === oldName;
        if (isActiveTarget && ACTIVE_POINTER_UNSUPPORTED_APIS.has(apiId)) {
            throw new Error('暂不支持重命名当前正在使用的 Kobold/Novel 预设（无法可靠更新名称指针）。请先在 SillyTavern 中切换到其他预设，再对它重命名。');
        }
        const pointerTarget = isActiveTarget ? getActivePointerTarget(apiId) : null;
        if (isActiveTarget && !pointerTarget) {
            throw new Error('当前 SillyTavern 版本无法安全更新当前预设的名称指针，已拒绝重命名当前正在使用的预设。请先切换到其他预设再重命名。');
        }

        const stored = manager.getCompletionPresetByName(oldName);
        if (!stored || typeof stored !== 'object') {
            throw new Error('无法读取目标预设的存储内容，已取消。');
        }
        const legacyBlock = getLegacyBlockReason(apiId, stored);
        if (legacyBlock) {
            throw new Error(legacyBlock);
        }

        const content = structuredClone(stored);
        if (INNER_NAME_APIS.has(apiId)) {
            content.name = newName;
        }

        try {
            await manager.savePreset(newName, content, { skipUpdate: true });
        } catch (error) {
            const reason = error && error.message ? error.message : String(error);
            throw new Error('保存新预设失败：' + reason + '。原预设未受影响。');
        }

        let diskContent;
        try {
            diskContent = await fetchDiskPreset(apiId, newName);
        } catch (error) {
            throw new Error('新预设已保存，但校验时重新读取失败（' + error.message + '）。已中止，未删除原预设。');
        }
        if (!diskContent || typeof diskContent !== 'object') {
            throw new Error('新预设保存后未能从磁盘读到。已中止，未删除原预设。');
        }
        if (!deepEqual(diskContent, JSON.parse(JSON.stringify(content)))) {
            throw new Error('新预设的磁盘内容与原预设不一致。已中止，未删除原预设。');
        }

        await emitRenameEvent('PRESET_RENAMED_BEFORE', { apiId, oldName, newName });

        let deleteOk = false;
        try {
            if (isActiveTarget) {
                renameEntryInPlace(manager, oldName, newName, content);
                pointerTarget.settings[pointerTarget.key] = newName;
                const context = getContext();
                if (context && typeof context.saveSettingsDebounced === 'function') {
                    context.saveSettingsDebounced();
                }
                deleteOk = await postDeletePresetFile(apiId, oldName);
            } else {
                deleteOk = await manager.deletePreset(oldName);
            }
        } catch (deleteError) {
            deleteOk = false;
        }

        if (!deleteOk) {
            try {
                ensurePresetEntry(manager, oldName, stored);
                ensurePresetEntry(manager, newName, content);
            } catch (restoreError) {
                console.warn(LOG_TAG, '恢复预设条目失败', restoreError);
            }
            throw new Error('新预设已保存并校验通过，但删除旧预设失败，可能出现新旧并存（' + oldName + ' / ' + newName + '）。请检查后手动处理旧预设。');
        }

        if (!isActiveTarget) {
            appendPresetEntry(manager, newName, content);
        }

        await emitRenameEvent('PRESET_RENAMED', { apiId, oldName, newName });
    }

    function openBatchPanel() {
        const names = selectedNamesInCurrentOrder();
        if (!names.length) {
            toast('warning', '请先选择要重命名的预设。');
            return;
        }

        state.batchNames = names.slice();
        state.batchMode = 'prefix';
        updateBatchModeVisibility();
        $batchPanel.prop('hidden', false);
        renderBatchPreview();
    }

    function closeBatchPanel() {
        $batchPanel.prop('hidden', true);
        state.batchNames = [];
        $batchPreview.empty();
        $batchErrors.hide().empty();
    }

    function updateBatchModeVisibility() {
        const mode = state.batchMode || 'prefix';
        $root.find('input[name="pr-batch-mode"]').each(function () {
            $(this).prop('checked', $(this).val() === mode);
        });
    }

    function getBatchPlan() {
        const mode = state.batchMode || 'prefix';
        const affix = String($affixInput.val() == null ? '' : $affixInput.val());
        const existing = getPresetNamesFromManager(getCurrentManager());

        const plan = state.batchNames.map((oldName) => {
            const newName = mode === 'prefix' ? affix + oldName : oldName + affix;

            let error = isSafeFilename(newName);
            if (!error && normalizeName(newName) === normalizeName(oldName)) {
                error = '名称没有变化。';
            } else if (!error) {
                const duplicate = existing.find(name => name !== oldName && normalizeName(name) === normalizeName(newName));
                if (duplicate) {
                    error = '与现有预设重名：' + duplicate;
                }
            }

            return { oldName, newName, error };
        });

        const seenByName = new Map();
        plan.forEach((item, index) => {
            if (item.error) {
                return;
            }
            const normalized = normalizeName(item.newName);
            if (seenByName.has(normalized)) {
                item.error = '目标名称与其他批量项重复。';
                const previousIndex = seenByName.get(normalized);
                if (previousIndex !== undefined && !plan[previousIndex].error) {
                    plan[previousIndex].error = '目标名称与其他批量项重复。';
                }
            } else {
                seenByName.set(normalized, index);
            }
        });

        return plan;
    }

    function renderBatchPreview() {
        $batchPreview.empty();
        const plan = getBatchPlan();

        for (const item of plan) {
            const classes = ['pr-batch-preview-row'];
            if (item.error) {
                classes.push('pr-batch-preview-row-error');
            }
            const $row = $('<div></div>', { class: classes.join(' ') });
            $row.append($('<span></span>', { class: 'pr-batch-preview-old', text: item.oldName }));
            $row.append($('<span></span>', { class: 'pr-batch-preview-arrow', text: '→' }));
            $row.append($('<span></span>', { class: 'pr-batch-preview-new', text: item.newName }));
            if (item.error) {
                $row.append($('<span></span>', { class: 'pr-batch-preview-error', text: item.error }));
            }
            $batchPreview.append($row);
        }

        const errors = plan.filter(item => item.error).map(item => item.error);
        $batchErrors.empty();
        if (errors.length) {
            for (const error of errors) {
                $batchErrors.append($('<div></div>', { class: 'pr-batch-error', text: error }));
            }
            $batchErrors.show();
        } else {
            $batchErrors.hide();
        }

        $root.find('.pr-batch-apply').prop(
            'disabled',
            plan.length === 0 || errors.length > 0 || state.applying,
        );
    }

    async function applyBatchRename() {
        if (state.applying) {
            return;
        }
        if (!state.batchNames.length) {
            toast('warning', '请先选择要重命名的预设。');
            return;
        }

        const plan = getBatchPlan();
        const invalid = plan.filter(item => item.error);
        if (invalid.length) {
            renderBatchPreview();
            toast('warning', '有些名称不合法，请修正后再应用。');
            return;
        }

        state.applying = true;
        updateSelectionCount();
        $root.find('.pr-batch-apply').prop('disabled', true);

        const succeeded = [];
        try {
            for (const item of plan) {
                await renamePreset(state.apiId, item.oldName, item.newName);
                state.selected.delete(item.oldName);
                state.selected.add(item.newName);
                succeeded.push(item);
            }
            toast('success', '已重命名 ' + succeeded.length + ' 个预设。');
            closeBatchPanel();
        } catch (error) {
            const failedItem = plan[succeeded.length];
            const unprocessed = plan.length - succeeded.length - (failedItem ? 1 : 0);
            let message = failedItem
                ? '重命名「' + failedItem.oldName + '」失败：' + (error.message || '未知错误')
                : '批量重命名失败：' + (error.message || '未知错误');
            if (succeeded.length) {
                message += ' 已成功 ' + succeeded.length + ' 个（' + succeeded.map(item => item.newName).join('、') + '）。';
            }
            if (unprocessed > 0) {
                message += ' 其余 ' + unprocessed + ' 个未处理。';
            }
            toast('error', message);
            renderBatchPreview();
        } finally {
            state.applying = false;
            renderPresetList();
            updateSelectionCount();
        }
    }

    function init() {
        if (state.initialized) {
            return;
        }

        chooseInitialApiId();
        buildRoot();
        renderTypeOptions();
        bindEvents();
        bindGlobalEvents();
        renderPresetList();
        updateSelectionCount();
        state.initialized = true;
    }

    if (document.readyState === 'loading') {
        $(document).ready(init);
    } else {
        init();
    }
})();
