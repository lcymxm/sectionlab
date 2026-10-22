// Package web 把前端资源嵌进 exe，交付物就是一个文件。
package web

import "embed"

//go:embed index.html app.js style.css geometry.js
var FS embed.FS

// Version 由构建脚本通过 -ldflags 覆盖，这里是兜底值。
var Version = "0.1.0"
