import assert from 'node:assert/strict';

/** Discovered by the application's addon HTTP test runner only while enabled. */
export async function runHttpTests(agent: any) {
    const { ObjectId } = require('mongodb');
    const { PNG } = require('pngjs');
    const { coll, framePath } = require('../model');
    const { storage } = global.Hydro.model;
    const id = new ObjectId();
    const path = framePath(id.toHexString());
    const image = new PNG({ width: 128, height: 128 });
    image.data.fill(0);
    image.data[3] = 255;
    try {
        await storage.put(path, PNG.sync.write(image), 1);
        await coll.insertOne({ _id: id, name: 'Thumbnail test', active: true, createdAt: new Date(), createdBy: 1 });
        const url = `/honor-frame/${id}.png?size=64`;
        const first = await agent.get(url).expect(200).expect('Content-Type', /image\/png/);
        assert.equal(PNG.sync.read(first.body).width, 64);
        assert.equal(first.headers['cache-control'], 'public, max-age=300, must-revalidate');
        await agent.get(url).set('If-None-Match', first.headers.etag).expect(304);
        await agent.get(`/d/system${url}`).expect(200);
        await agent.get(`/honor-frame/${id}.png?size=123`).expect(403);
        await agent.get(`${url}&v=stale`).expect(404);
        await coll.updateOne({ _id: id }, { $set: { active: false } });
        await agent.get(url).set('If-None-Match', first.headers.etag).expect(404);
    } finally {
        await coll.deleteOne({ _id: id });
        await storage.del([path]);
    }
}
