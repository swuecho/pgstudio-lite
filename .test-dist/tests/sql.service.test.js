"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const sqlService = __importStar(require("../features/sql/sql.service"));
function installFetchMock(queue) {
    const calls = [];
    globalThis.fetch = (async (path, options) => {
        calls.push({ path: String(path), options });
        const current = queue.shift();
        if (!current)
            throw new Error('Missing mock response');
        return {
            ok: current.ok,
            status: current.status,
            json: async () => current.payload,
        };
    });
    return calls;
}
(0, node_test_1.default)('runQuery posts SQL body', async () => {
    const calls = installFetchMock([
        {
            ok: true,
            status: 200,
            payload: {
                statements: [{ command: 'SELECT', rowCount: 1, fields: ['id'], rows: [{ id: 1 }] }],
                totalRows: 1,
                durationMs: 5,
            },
        },
    ]);
    const result = await sqlService.runQuery('default', 'select 1;');
    strict_1.default.equal(calls.length, 1);
    strict_1.default.equal(calls[0].path, '/api/query');
    strict_1.default.equal(calls[0].options?.method, 'POST');
    strict_1.default.equal(calls[0].options?.body, JSON.stringify({ connectionName: 'default', query: 'select 1;' }));
    strict_1.default.equal(result.totalRows, 1);
});
(0, node_test_1.default)('getSchemaColumns URL-encodes params', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [{ name: 'id' }] } }]);
    await sqlService.getSchemaColumns('my conn', 'public schema', 'user-table');
    strict_1.default.equal(calls[0].path, '/api/schema/columns?connectionName=my%20conn&schema=public%20schema&table=user-table');
});
(0, node_test_1.default)('clearHistory surfaces API error', async () => {
    installFetchMock([{ ok: false, status: 500, payload: { error: 'boom' } }]);
    await strict_1.default.rejects(sqlService.clearHistory(), /boom/);
});
