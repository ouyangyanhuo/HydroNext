import assert from 'assert';
import { writeFileSync } from 'fs';
import autocannon from 'autocannon';
import {
    after, before, describe, it,
} from 'node:test';
import * as supertest from 'supertest';
import { STATUS } from '@hydrooj/common';

const Root = {
    username: 'root',
    password: '123456',
    creditionals: null,
};

function getPageArgs(response: any) {
    const injection = response.text?.match(/<script id="__HYDRO_INJECTION__" type="application\/json">([\s\S]*?)<\/script>/);
    return injection ? JSON.parse(injection[1]).args : response.body;
}

describe('App', () => {
    let agent;
    before(async () => {
        const init = Date.now();
        await new Promise((resolve) => {
            process.send = ((send) => (data) => {
                console.log('send', data);
                if (data === 'ready') {
                    agent = supertest.agent(require('hydrooj').httpServer);
                    resolve(null);
                }
                return send?.(data) || false;
            })(process.send);
        });
        console.log('Application inited in %d ms', Date.now() - init);
    }, { timeout: 30000 });

    const routes = ['/', '/p', '/contest', '/homework', '/user/1', '/training', '/ranking', '/ranking?sort=rp'];
    for (const route of routes) {
        // eslint-disable-next-line ts/no-loop-func
        it(`GET ${route}`, () => agent.get(route).expect(200));
    }

    it('API user', async () => {
        await agent.get('/api/user?args={"id":1}&projection=uname').expect({ uname: 'Hydro' });
        await agent.get('/api/user?args={"id":2}&projection=uname').expect(null);
    });

    it('Create User', async () => {
        const redirect = await agent.post('/register')
            .send({ mail: 'test@example.com' })
            .expect(302)
            .then((res) => res.headers.location);
        await agent.post(redirect)
            .send({ uname: Root.username, password: Root.password, verifyPassword: Root.password })
            .expect(302);
    });

    it('Login', async () => {
        const cookie = await agent.post('/login')
            .send({ uname: Root.username, password: Root.password })
            .expect(302)
            .then((res) => res.headers['set-cookie']);
        Root.creditionals = cookie;
    });

    it('API registered user', async () => {
        await agent.get('/api/user?args={"id":2}&projection=uname').expect({ uname: 'root' });
    });

    it('Solved ranking includes domain members with zero solved problems', async () => {
        const res = await agent.get('/ranking').expect(200);
        const args = getPageArgs(res);
        assert.equal(args.sort, 'solved');
        assert.equal(args.udocs[0]._id, 2);
        assert.equal(args.solvedCounts[2], 0);
    });

    it('Solved ranking counts only accepted problems in this domain', async () => {
        const { TYPE_PROBLEM } = global.Hydro.model.document;
        await global.Hydro.model.document.collStatus.insertMany([
            { domainId: 'system', docType: TYPE_PROBLEM, docId: 1001, uid: 2, status: STATUS.STATUS_ACCEPTED },
            { domainId: 'system', docType: TYPE_PROBLEM, docId: 1002, uid: 2, status: STATUS.STATUS_WRONG_ANSWER },
            { domainId: 'other', docType: TYPE_PROBLEM, docId: 1003, uid: 2, status: STATUS.STATUS_ACCEPTED },
        ]);
        const res = await agent.get('/ranking').expect(200);
        const args = getPageArgs(res);
        assert.equal(args.solvedCounts[2], 1);
        assert.equal(args.udocs[0]._id, 2);
    });

    // TODO add more tests

    const results: Record<string, autocannon.Result> = {};
    if (process.env.BENCHMARK) {
        for (const route of routes) {
            it(`Performance test ${route}`, { timeout: 60000 }, async () => {
                const result = await autocannon({ url: `http://localhost:8888${route}` });
                assert(result.errors === 0, `test ${route} returns errors`);
                results[route] = result;
            });
        }
    }

    after(() => {
        if (process.env.BENCHMARK) {
            const metrics = Object.entries(results).map(([k, v]) => ({
                name: `Benchmark - ${k} - Req/sec`,
                unit: 'Req/sec',
                value: v.requests.average,
            }));
            writeFileSync('./benchmark.json', JSON.stringify(metrics, null, 2));
        }
        setTimeout(() => process.exit(0), 1000);
    });
});
