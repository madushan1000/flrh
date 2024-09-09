const CDN_ROOT = "https://cdn.jsdelivr.net/gh/madushan1000/flrh-data@1beaa8d66c89d3bd590462d8d27f04cca454a5dc";
const BERGAMOT_TRANSLATOR_MODULE = "/bergamot-translator-worker.js";
const MODEL_REGISTRY = "/registry.json";
let FLRHrootURL = "";
let registry = {};
let loaded_models = new Map();
let translation_service = null;

var Module = {
    locateFile: function(path, scriptDirectory) {
        return CDN_ROOT + "/" + path;
    },
};

onmessage = async function(e) {
    try {
        const command = e.data[0];
        let reply;
        if (command === "import") {
            FLRHrootURL = e.data[1];
            Module.onRuntimeInitialized = async () => {
                registry = await fetch(CDN_ROOT + MODEL_REGISTRY).then(res => res.json());
                e.ports[0].postMessage({result: registry });
            };
            importScripts(CDN_ROOT + BERGAMOT_TRANSLATOR_MODULE);
        }
        if (command === "translate") {
            const srclang = e.data[1];
            const dstlang = e.data[2];
            const text = e.data[3];
            const translation = await translate(srclang, dstlang, text);
            e.ports[0].postMessage({result: translation});
        }
    } catch (err) {
        e.ports[0].postMessage({error: err});
    }
}

async function translate(srclang, dstlang, text) {

    let singlemodel = false;
    if (registry[srclang + dstlang]) {
        singlemodel = true;
    } else if(!(registry[srclang + "en"] && registry["en" + dstlang])) {
        throw new Error(`language pair ${srclang}${dstlang} not supported!`);
    }

    const input = new Module.VectorString();
    input.push_back(text);

    const options = new Module.VectorResponseOptions();
    options.push_back({qualityScores: true, alignment: "soft", html: false});
    let output; 

    if (singlemodel) {
        const model = await ensure_model_loaded(srclang, dstlang);
        output = translation_service.translate(model, input, options);
    } else {
        const src_model = await ensure_model_loaded(srclang, "en");
        const dst_model = await ensure_model_loaded("en", dstlang);
        output = translation_service.translateViaPivoting(src_model, dst_model, input, options);
    }
    ret = output.get(0).getTranslatedText();
    input.delete();
    options.delete();
    output.delete();
    return ret;
}

async function ensure_model_loaded(srclang, dstlang) {
    if (!translation_service) {
        const service_config = {cacheSize: 0};
        translation_service = new Module.BlockingService(service_config);
    }
    if (loaded_models.has(srclang + dstlang)){
        return loaded_models.get(srclang + dstlang);
    }
    const model = await load_model(srclang + dstlang);
    loaded_models.set(srclang + dstlang, model);
    return model;
}

async function load_model(langpair) {
    const entry = registry[langpair];
    const model_path = `${CDN_ROOT}/models/${entry.model.modelType}/${langpair}/${entry.model.name}.gz`;
    const lex_path = `${CDN_ROOT}/models/${entry.lex.modelType}/${langpair}/${entry.lex.name}.gz`;
    const vocab_path = `${CDN_ROOT}/models/${entry.vocab.modelType}/${langpair}/${entry.vocab.name}.gz`;

    const resps = await Promise.all([
        fetch(model_path),
        fetch(lex_path),
        fetch(vocab_path),
    ]);
    const blobs = await Promise.all(resps.map(res => res.body));
    const mems = await Promise.all(blobs.map(blob => new Response(blob.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()));
    
    const model_mem = load_memory(mems[0], 256);
    const shortlist_mem = load_memory(mems[1], 64);
    const vocab_mem = load_memory(mems[2], 64);
    const model_config = [
      "beam-size: 1",
      "normalize: 1.0",
      "word-penalty: 0",
      "max-length-break: 128",
      "mini-batch-words: 1024",
      "workspace: 128",
      "max-length-factor: 2.0",
      "skip-cost: true",
      "cpu-threads: 0",
      "quiet: true",
      "quiet-translation: true",
      "gemm-precision: int8shiftAll",
      "alignment: soft",
    ].join("\n");

    const vocabs_list = new Module.AlignedMemoryList();
    vocabs_list.push_back(vocab_mem);

    const model = new Module.TranslationModel(model_config, model_mem, shortlist_mem, vocabs_list, null);

    return model;
}

function load_memory(buffer, alignment) {
    const byte_array = new Int8Array(buffer);
    const aligned_memory = new Module.AlignedMemory(byte_array.byteLength, alignment);
    const view = aligned_memory.getByteArrayView();
    view.set(byte_array);
    return aligned_memory;
}


