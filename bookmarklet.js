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
    let position = 0;

    const node_iter = document.createNodeIterator(document.body,
        NodeFilter.SHOW_TEXT, 
        (node) => {
            if (node.parentElement.tagName === 'SCRIPT'
                || node.parentElement.tagName === 'STYLE') {
                return NodeFilter.FILTER_SKIP;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    );

    const textNodes = [];

    while ((currentNode = node_iter.nextNode())){
        textNodes.push(currentNode);
    }

    const ignore_chars = /[^\p{Punctuation}\s]/gu;

    for (el of textNodes) {
        const segmenter = new Intl.Segmenter([], { granularity: 'word' });
        const segments = segmenter.segment(el.textContent);
        let newHTML = "";
        for (const {segment} of segments) {
            if (ignore_chars.test(segment)) {
                newHTML += `<span data-p=${position} class="flrh-translatable"><div class="flrh-original-text">${segment}</div></span>`;
                position += 1;
            }
            else {
                newHTML += segment;
            }
        }
        if (newHTML.length != 0) { 
            const tmp = document.createElement('span');
            tmp.innerHTML = newHTML;
            el.parentNode.replaceChild(tmp, el);
        }
    }
}

function setup_event_listners() {
    document.body.addEventListener('click', async (event) => {
        const el = event.target;
        if (el.classList.contains('flrh-original-text') && el.parentElement.parentElement?.hasAttribute('data-group')){
            await split_group(el);
            return;
        }
        if (el.classList.contains('flrh-original-text') && !el.parentElement.hasAttribute('data-translated')) {
            await add_translation(el);
            return;
        } 
        if (el.classList.contains('flrh-original-text') && el.parentElement.hasAttribute('data-translated')) {
            remove_translation(el);
            return;
        }
    });

    document.body.addEventListener('auxclick', async (event) => {
        const el = event.target;
        if (el.classList.contains('flrh-original-text') && el.parentElement.parentElement?.hasAttribute('data-group')){
            clear_group(el);
            return;
        }
    });
}

async function add_translation(element) {
    const siblings = find_groupable_siblings(element);
    if (siblings.prev || siblings.next) {
        const group = merge_group(element, siblings);
        await add_translated_group_element(group);

    } else {
        await add_translated_element(element);
    }
}

function remove_translation(element) {
    remove_translated_element(element.parentElement);
}

async function add_translated_element(element) {
    if (element){
        const text = element.textContent;
        const translated_text = await translate(text);
        new_translation_elment(element.parentElement,translated_text);
    }
}

function remove_translated_element(element) {   
    const translated = element.querySelector(".flrh-translated-text");
    element.removeChild(translated);
    element.removeAttribute('data-translated');
}

async function add_translated_group_element(group) {
    const text = group.textContent;
    const translated_text = await translate(text);
    const translatables = Array.from(group.querySelectorAll('.flrh-translatable'));
    segments = translated_text.split(/\s+/);

    let i = 0;
    for (element of translatables) {
        new_translation_elment(element, segments[i]);
        const span = document.createElement('span');
        i += 1;
    }
    const distances = compute_distances(group);

    if (distances.length == 1){
        const nts = new_translation_span(translated_text);
        group.insertBefore(nts, group.firstChid);
    } else {
        const total = distances.map(([d , _]) => d).reduce((a,b) => a + b, 0);
        let i = 0;
        for (const [distance, start, end] of distances) {
            const ni = Math.floor(segments.length * distance/total);
            let text = segments.slice(i, i + ni).join(" ");
            const nts = new_translation_span(text);
            //if (i > 0) {
            //    const br = document.createElement('div');
            //    br.classList.add('flrh-translated-span-line-break');
            //    el.parentElement.nextElementSibling.insertBefore(br, el.parentElement.nextElementSibling.firstChild);
            //}
            group.insertBefore(nts, start);
            console.log(text, i, ni, distance, total);
            i = ni + i;
        }
    }
}

function compute_distances(group) {
    const rects = group.getClientRects();
    const distances = [];
    for (rect of rects) {
        const res = [];
        let start = document.elementFromPoint(rect.x, rect.y).closest('.flrh-translatable');
        const end = document.elementFromPoint(rect.right - 0.01, rect.bottom).closest('.flrh-translatable');
        console.log(start, end);
        res.push(start);
        res.push(end);
        let count = 0;
        while(start != end) {
            count += 1;
            start = start.nextElementSibling;
        }
        res.unshift(count + 1);
        distances.push(res);
    }

    return distances;
}

function new_translation_span(text) {
    const nts = document.createElement('span');
    nts.classList.add('flrh-translated-span');
    nts.textContent = text;
    return nts;
}

function new_translation_elment(parent, text) {
    const nel = document.createElement('div');
    nel.classList.add('flrh-translated-text');
    //nel.textContent = text;
    parent.insertBefore(nel,parent.firstChild);
    parent.setAttribute('data-translated', true);
}

function remove_translated_group_element(group) {
    const translated = group.querySelectorAll(".flrh-translatable");
    translated.forEach((node) => remove_translated_element(node));
    const translated_span = group.querySelectorAll(".flrh-translated-span");
    translated_span.forEach(span => span.remove());
    const translated_span_br = group.querySelectorAll(".flrh-translated-span-line-break");
    translated_span_br.forEach(br => br.remove());
}

function find_groupable_siblings(element) {
    let siblings = {};
    if (element.parentElement.previousElementSibling?.hasAttribute('data-translated')){
        siblings.prev = element.parentElement.previousElementSibling;
    }
    if (element.parentElement.nextElementSibling?.hasAttribute('data-translated')){
        siblings.next = element.parentElement.nextElementSibling;
    }
    if (element.parentElement.previousElementSibling?.hasAttribute('data-group')){
        siblings.prev = element.parentElement.previousElementSibling;
    }
    if (element.parentElement.nextElementSibling?.hasAttribute('data-group')){
        siblings.next = element.parentElement.nextElementSibling;
    }
    return siblings;
}

function merge_group(element, siblings) {
    const {prev, next} = siblings;
    let pnodes = [];
    let nnodes = [];
    const parent = element.parentElement;

    if (prev?.hasAttribute('data-translated')) {
        remove_translated_element(prev);
        pnodes = get_nodes_between(prev, parent);
        pnodes.unshift(prev);
    }
    if (next?.hasAttribute('data-translated')) {
        remove_translated_element(next);
        nnodes = get_nodes_between(parent, next);
        nnodes.push(next);
    }
    if (prev?.hasAttribute('data-group')) {
        remove_translated_group_element(prev);
        pnodes.push(...prev.childNodes);
        pnodes.push(...get_nodes_between(prev, parent));
    }
    if (next?.hasAttribute('data-group')) {
        remove_translated_group_element(next);
        nnodes.push(...get_nodes_between(parent, next));
        nnodes.push(...next.childNodes);
    }

    const new_group = document.createElement('span');
    new_group.setAttribute('data-group', '');
    element.parentElement.parentElement.insertBefore(new_group, parent);
    new_group.append(...pnodes, parent, ...nnodes);

    if (prev?.hasAttribute('data-group')) {
        prev.remove();
    }
    if (next?.hasAttribute('data-group')) {
        next.remove();
    }
    return new_group;
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

function get_nodes_between(el1, el2) {
    let nodes = [];
    let cl = el1;
    while(cl != el2) {
        cl = cl.nextSibling;
        nodes.push(cl);
    }
    nodes.pop();
    return nodes;
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
