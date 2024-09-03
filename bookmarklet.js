async function main() {
    const response = await fetch(window.FLRHrootURL + "/dialog.html");
    const container = document.createElement("div");
    const text = await response.text();

    container.innerHTML = text;
    document.body.appendChild(container);

    dialog = document.body.querySelector("#flrh-dialog");
    dialog.show();
    dialog_cancel = dialog.querySelector("#flrh-dialog-close-button");
    dialog_cancel.addEventListener("click", () => {
        dialog.close();
        window.location.reload();
    });
    
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
        const nel = document.createElement('div');
        nel.classList.add('flrh-translated-text');
        nel.textContent = translated_text;
        element.parentElement.insertBefore(nel, element);
        element.parentElement.setAttribute('data-translated', true);
    }
}

async function add_translated_group_element(group) {
    const text = group.textContent;
    const translated_text = await translate_group(text);
    const nel = document.createElement('div');
    nel.classList.add('flrh-translated-group-text');
    nel.textContent = translated_text;
    group.insertBefore(nel, group.firstChild);
}

function remove_translated_element(element) {   
    const translated = element.querySelector(".flrh-translated-text");
    element.removeChild(translated);
    element.removeAttribute('data-translated');
}

function remove_translated_group_element(group) {
    const translated = group.querySelector(".flrh-translated-group-text");
    group.removeChild(translated);
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

    if (group) {
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
    return text;
}

async function translate_group(text) {
    return text.toUpperCase();
}


document.head.insertAdjacentHTML('beforeend', `<link typs="text/css" rel="stylesheet" href="${window.FLRHrootURL}/main.css">`);

main()
