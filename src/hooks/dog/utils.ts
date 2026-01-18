import { getModel, putModel } from '../../lib/indexedDB';

export const loadDogData = async (name: string, path: string) => {
    let data = await getModel(name);
    if (!data) {
        const resp = await fetch(path);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        data = await resp.arrayBuffer();
        await putModel(name, data);
    }
    return data;
};
