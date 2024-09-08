async function main() {
    [window.translation_worker, registry] = await setup_worker();
    create_overlay(registry);
    spanify_page();
    setup_event_listners();
    
}

async function create_overlay(registry){
    const response = await fetch(window.FLRHrootURL + "/dialog.html");
    const container = document.createElement("div");
    const text = await response.text();

    container.innerHTML = text;


    const lang_map = new Map();

    for (const touple in registry) {
        const srclang = touple.slice(0, 2);
        const dstlang = touple.slice(2, 4);
        if (lang_map.has(srclang)) {
            lang_map.get(srclang).set(dstlang, true);
        } else {
            const dst_map = new Map();
            dst_map.set(dstlang, true);
            lang_map.set(srclang, dst_map);
        }
    }

    const dn = new Intl.DisplayNames(["en"], { type: "language" })

    const srclang_options = container.querySelector("#srclang");
    for (const key of lang_map.keys()) {
        const option = document.createElement("option")
        option.textContent = dn.of(key);
        option.id = key;
        srclang_options.appendChild(option);
        if (key === "de") {
            option.setAttribute("selected", "");
        }
    }

    const dstlang_options = container.querySelector("#dstlang");
    for (const key of lang_map.get("en").keys()) {
        const option = document.createElement("option")
        option.textContent = dn.of(key);
        option.id = key;
        dstlang_options.appendChild(option);
    }

    document.body.appendChild(container);

    dialog = document.body.querySelector("#flrh-dialog");
    dialog.show();
    dialog_cancel = dialog.querySelector("#flrh-dialog-close-button");
    dialog_cancel.addEventListener("click", () => {
        dialog.close();
        window.location.reload();
    });
}

async function setup_worker() {
    let worker_url = getWorkerURL(window.FLRHrootURL + "/worker.js");
    const worker = new Worker(worker_url);
    const res = await send_command(worker, ["import", window.FLRHrootURL]);
    return [worker, res];
}

function send_command(worker, command) {
    return new Promise((res, rej) => {
        const channel = new MessageChannel();

        channel.port1.onmessage = ({data}) => {
            channel.port1.close();
            if (data.error) {
                rej(data.error);
            } else {
                res(data.result);
            }
        };
        worker.postMessage(command, [channel.port2]);
    });
}

function spanify_page() {
    const node_iter = document.createNodeIterator(document.body,
        NodeFilter.SHOW_TEXT, 
        (node) => {
            if (node.parentElement.tagName === 'SCRIPT'
                || node.parentElement.tagName === 'STYLE'
            ) {
                return NodeFilter.FILTER_SKIP;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    );

    const textNodes = [];
    while ((currentNode = node_iter.nextNode())){
        textNodes.push(currentNode);
    }

    const ignore_chars = /^[\p{Punctuation}\s]+/u;
    for (el of textNodes) {
        if (/^\s*$/.test(el.textContent)) {
            continue;
        }
        const segmenter = new Intl.Segmenter([], { granularity: 'word' });
        const segments = segmenter.segment(el.textContent);
        let newHTML = Array.from(segments).map(segment => `<span>${segment.segment}</span>`).join("");

        const text_element = document.createElement('span');
        if (newHTML.length != 0) { 
            el.parentNode.insertBefore(text_element, el);
            text_element.insertAdjacentHTML("afterbegin", newHTML);
            el.remove();
        }

        let blockHTML = `<span class="flrh-line" id= ${Math.random().toString(16).slice(2)}>`;
        let bottom = text_element.firstElementChild?.getBoundingClientRect().bottom; 
        for (child of text_element.children) {
            if (bottom < child.getBoundingClientRect().bottom) {
                bottom = child.getBoundingClientRect().bottom;
                blockHTML += `</span> <span class="flrh-line" id= ${Math.random().toString(16).slice(2)}>` ;
            }
            if (ignore_chars.test(child.textContent)) {
                blockHTML += child.textContent;
            } else {
                blockHTML += `<span class="flrh-translatable">${child.textContent}</span>`;
            }
        }
        blockHTML += '</span>';
        text_element.innerHTML = blockHTML;
    }
}

function setup_event_listners() {
    document.body.addEventListener('click', async (event) => {
        const el = event.target;
        if (el.classList.contains('flrh-translatable')) {
            el.classList.toggle('flrh-translated');
            await handle_group(el);
        }
    });

    document.body.addEventListener('auxclick', async (event) => {
        const el = event.target;
    });
}

async function handle_group(element) {
    if (!element.classList.contains('flrh-translated')) {
        //split_group(element);
        return;
    }
    const new_group_id = Math.random().toString(16).slice(2);
    element.setAttribute('data-group', new_group_id);
    merge_next_group(element, element.closest('.flrh-line'), new_group_id);
    merge_prev_group(element, element.closest('.flrh-line'), new_group_id);
    const weights = containerize_group(new_group_id);
    await add_translation(new_group_id, weights);
}

async function add_translation(group_id, weights) {
    const elements = document.querySelectorAll(`[data-group="${group_id}"]`);
    const range = new Range()
    range.setStartBefore(elements[0]);
    range.setEndAfter(elements[elements.length - 1]);
    let text = range.toString();
    text = text.replace(/[\n\r\s]+/g, ' ');
    const translated_text = await translate(text);

    const segments = translated_text.split(/\s+/);
    console.log(translated_text)
    let i = 0;
    const total = weights.reduce((a, b) => a + b[1], 0);
    for (const [line_id, weight, anker] of weights) {
        const ni = Math.ceil(segments.length * weight/total);
        const fraction = segments.slice(i, i + ni).join(' ');
        i += ni;
        console.log(total, weight, ni, fraction, anker);
        anker.insertAdjacentHTML("afterbegin", `<span class="flrh-translated-text">${fraction}</span>`);
    }
}

function containerize_group(id) {
    const elements = document.querySelectorAll(`[data-group="${id}"]`);
    const by_line = Object.groupBy(elements, el => el.closest('.flrh-line').id);
    const weights = [];
    for ([line, value] of Object.entries(by_line)) {
        const highlight = document.createElement('span');
        value[0].before(highlight);
        highlight.classList.add('flrh-highlight');
        let range = new Range();
        range.setStartBefore(value[0]);
        range.setEndAfter(value.at(-1));
        highlight.append(range.extractContents());
        highlight.querySelectorAll('.flrh-translated-text').forEach(el => el.remove());
        weights.push([line, value.length, value[0]]);
    }
    return weights;
}

function merge_prev_group(element, line, id) {
    if (element) {
        if (element.hasAttribute('data-group')) {
            element.setAttribute('data-group', id);
            merge_prev_group(element.previousElementSibling, line, id);
        } else if (element.classList.contains('flrh-highlight')) {
            const el = element.lastElementChild;
            element.replaceWith(...element.childNodes);
            merge_prev_group(el, line, id);
        }
    } else {
        if (line.previousElementSibling?.lastElementChild) {
            merge_prev_group(line.previousElementSibling.lastElementChild, line.previousElementSibling, id);
        }
    }
}
function merge_next_group(element, line, id) {
    if (element) {
        if (element.hasAttribute('data-group')) {
            element.setAttribute('data-group', id);
            merge_next_group(element.nextElementSibling, line, id);
        } else if (element.classList.contains('flrh-highlight')) {
            const el = element.firstElementChild;
            element.replaceWith(...element.childNodes);
            merge_next_group(el, line, id);
        }
    } else {
        if (line.nextElementSibling?.firstElementChild) {
            merge_next_group(line.nextElementSibling.firstElementChild, line.nextElementSibling, id);
        }
    }
}

function remove_translated_group_element(group) {
    const translated = group.querySelectorAll(".flrh-translatable");
    translated.forEach((node) => remove_translated_element(node));
    const translated_span = group.querySelectorAll(".flrh-translated-span");
    translated_span.forEach(span => span.remove());
    const translated_span_br = group.querySelectorAll(".flrh-translated-span-line-break");
    translated_span_br.forEach(br => br.remove());
}


async function split_group(element) {
    const group = element.parentElement.parentElement;
    const parent = element.parentElement;
    const pnodes = [];
    const cnodes = [];
    const nnodes = [];

    remove_translated_group_element(group);
    
    let cn = group.firstChild;
    while(cn != parent) {
        pnodes.push(cn);
        cn = cn.nextSibling;
    }

    cnodes.push(cn);
    cn = cn.nextSibling;
    while(cn?.nodeType == Node.TEXT_NODE) {
        cnodes.push(cn);
        cn = cn.nextSibling;
    }

    while(cn) {
        nnodes.push(cn);
        cn = cn.nextSibling;
    }

    const pelnodes = pnodes.filter((el) => el.nodeType != Node.TEXT_NODE);
    if (pelnodes.length <= 1) {
        pnodes.forEach((node) => group.parentNode.insertBefore(node, group));
        await add_translated_element(pelnodes[0]?.firstChild);

    } else {
        const prev_group = document.createElement('span');
        prev_group.setAttribute('data-group', '');
        pnodes.forEach((node) => prev_group.appendChild(node));
        group.parentNode.insertBefore(prev_group, group);
        await add_translated_group_element(prev_group);
    }

    cnodes.forEach((node) => group.parentNode.insertBefore(node, group));

    const nelnodes = nnodes.filter((el) => el.nodeType != Node.TEXT_NODE);
    if (nelnodes.length <= 1) {
        nnodes.reverse().forEach((node) => group.parentNode.insertBefore(node, group.nextSibling));
        await add_translated_element(nelnodes[0]?.firstChild);
        group.remove();
    }

    if (group?.childNodes.length) {
        await add_translated_group_element(group);
    }
}

function clear_group(element) {
    const group = element.parentNode.parentNode;
    remove_translated_group_element(group);
    while(group.firstChild) {
        group.parentElement.insertBefore(group.firstChild, group);
    } 
    group.remove();
}

async function translate(text) {
    const flrh_dialog = document.getElementById("flrh-dialog");
    const srclang_select = flrh_dialog.querySelector("#srclang");
    const dstlang_select = flrh_dialog.querySelector("#dstlang");
    const srclang = srclang_select.options[srclang_select.selectedIndex];
    const dstlang = dstlang_select.options[dstlang_select.selectedIndex];
    const translation = await send_command(window.translation_worker, ["translate", srclang.id, dstlang.id, text]);
    return translation;
}

function getWorkerURL( url ) {
  const content = `importScripts( "${ url }" );`;
  return URL.createObjectURL( new Blob( [ content ], { type: "text/javascript" } ) );
}


document.head.insertAdjacentHTML('beforeend', `<link typs="text/css" rel="stylesheet" href="${window.FLRHrootURL}/main.css">`);

main()
