"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_INDEX = exports.elasticsearch = void 0;
const elasticsearch_1 = require("@elastic/elasticsearch");
exports.elasticsearch = new elasticsearch_1.Client({
    node: process.env.ELASTICSEARCH_URL || "http://localhost:19200",
});
exports.EMAIL_INDEX = "emails";
