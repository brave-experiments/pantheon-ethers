"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var index_1 = require("../index");
jest.setTimeout(15000);
var provider = new index_1.providers.PantheonProvider("http://localhost:20000");
provider.on('debug', function (info) {
    console.log("Sent \"" + info.action + "\" action to node 1 with request: " + JSON.stringify(info.request) + "\nResponse: " + JSON.stringify(info.response));
});
var providerNode2 = new index_1.providers.PantheonProvider("http://localhost:20002");
describe('Pantheon Admin APIs', function () {
    var node2enode;
    test('change log level', function () { return __awaiter(_this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.changeLogLevel('TRACE')];
                case 1:
                    result = _a.sent();
                    expect(result).toBeTruthy();
                    return [2 /*return*/];
            }
        });
    }); });
    test('get nodeInfo', function () { return __awaiter(_this, void 0, void 0, function () {
        var nodeInfo;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.getNodeInfo()];
                case 1:
                    nodeInfo = _a.sent();
                    expect(nodeInfo.id).toMatch(/^([A-Fa-f0-9]{128})$/);
                    expect(typeof nodeInfo.enode).toEqual('string');
                    expect(typeof nodeInfo.listenAddr).toEqual('string');
                    expect(typeof nodeInfo.name).toEqual('string');
                    expect(nodeInfo.ports.discovery).toBeGreaterThan(30000);
                    expect(nodeInfo.ports.listener).toBeGreaterThan(30000);
                    expect(nodeInfo.protocols).toBeDefined();
                    return [2 /*return*/];
            }
        });
    }); });
    test('get peers', function () { return __awaiter(_this, void 0, void 0, function () {
        var peers;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.getPeers()];
                case 1:
                    peers = _a.sent();
                    expect(peers).toHaveLength(5);
                    expect(peers[0].version).toEqual('0x5');
                    expect(typeof peers[0].name).toEqual('string');
                    expect(peers[0].caps.length).toBeGreaterThan(1);
                    expect(typeof peers[0].network.localAddress).toEqual('string');
                    expect(typeof peers[0].network.remoteAddress).toEqual('string');
                    return [2 /*return*/];
            }
        });
    }); });
    test('remove peer', function () { return __awaiter(_this, void 0, void 0, function () {
        var success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, providerNode2.getNodeInfo()];
                case 1:
                    // Get the enode of node 2
                    node2enode = (_a.sent()).enode;
                    return [4 /*yield*/, provider.removePeer(node2enode)];
                case 2:
                    success = _a.sent();
                    expect(success).toBeTruthy();
                    return [2 /*return*/];
            }
        });
    }); });
    test('add peer', function () { return __awaiter(_this, void 0, void 0, function () {
        var success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.addPeer(node2enode)];
                case 1:
                    success = _a.sent();
                    expect(success).toBeTruthy();
                    return [2 /*return*/];
            }
        });
    }); });
    test('change log level back', function () { return __awaiter(_this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.changeLogLevel('INFO')];
                case 1:
                    result = _a.sent();
                    expect(result).toBeTruthy();
                    return [2 /*return*/];
            }
        });
    }); });
    test('Pantheon Statistics', function () { return __awaiter(_this, void 0, void 0, function () {
        var stats;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.getPantheonStatistics()];
                case 1:
                    stats = _a.sent();
                    expect(stats.maxSize).toEqual(4096);
                    expect(stats.localCount).toEqual(0);
                    expect(stats.remoteCount).toEqual(0);
                    return [2 /*return*/];
            }
        });
    }); });
    test('Pantheon Transaction', function () { return __awaiter(_this, void 0, void 0, function () {
        var results;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, provider.getPantheonTransactions()];
                case 1:
                    results = _a.sent();
                    expect(results).toHaveLength(0);
                    return [2 /*return*/];
            }
        });
    }); });
});
