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
const tableService = __importStar(require("../features/table/table.service"));
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
(0, node_test_1.default)('getRows builds query params with filter', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [], rows: [], total: 0 } }]);
    await tableService.getRows({
        table: 'notes list',
        connectionName: 'default',
        page: 2,
        pageSize: 25,
        sortBy: 'id',
        sortOrder: 'desc',
        filterColumn: 'title',
        filterValue: 'todo',
        filterMode: 'contains',
    });
    strict_1.default.equal(calls[0].path, '/api/tables/notes%20list/rows?connectionName=default&limit=25&offset=50&sortBy=id&sortOrder=desc&filterColumn=title&filterValue=todo&filterMode=contains');
});
(0, node_test_1.default)('getRows omits filter params for blank filter value', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { columns: [], rows: [], total: 0 } }]);
    await tableService.getRows({
        table: 'notes',
        connectionName: 'default',
        page: 0,
        pageSize: 10,
        sortBy: 'id',
        sortOrder: 'asc',
        filterColumn: 'title',
        filterValue: '   ',
        filterMode: 'equals',
    });
    strict_1.default.match(calls[0].path, /^\/api\/tables\/notes\/rows\?/);
    strict_1.default.ok(!calls[0].path.includes('filterColumn='));
    strict_1.default.ok(!calls[0].path.includes('filterValue='));
    strict_1.default.ok(!calls[0].path.includes('filterMode='));
});
(0, node_test_1.default)('patchRow sends PATCH with payload', async () => {
    const calls = installFetchMock([{ ok: true, status: 200, payload: { ok: true } }]);
    await tableService.patchRow('notes', {
        connectionName: 'default',
        ctid: '(0,1)',
        patch: { title: 'new' },
    });
    strict_1.default.equal(calls[0].path, '/api/tables/notes/rows');
    strict_1.default.equal(calls[0].options?.method, 'PATCH');
    strict_1.default.equal(calls[0].options?.body, JSON.stringify({ connectionName: 'default', ctid: '(0,1)', patch: { title: 'new' } }));
});
