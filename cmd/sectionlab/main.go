// SectionLab —— 截面几何性质计算器。
//
// 起一个只监听 127.0.0.1 的本地服务，把内嵌的前端送进浏览器。
// 不联网、不上传、不落盘任何数据。
package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"sectionlab/web"
)

// buildArch 由构建脚本写入。
var buildArch = runtime.GOARCH

func main() {
	var (
		port    = flag.Int("port", 8740, "本地端口（被占用会自动往后找）")
		noOpen  = flag.Bool("no-open", false, "不要自动打开浏览器")
		showVer = flag.Bool("version", false, "只打印版本号")
	)
	flag.Parse()

	if *showVer {
		fmt.Printf("SectionLab %s windows/%s\n", web.Version, buildArch)
		return
	}

	ln, actual, err := listen(*port)
	if err != nil {
		fatal(err)
	}
	url := fmt.Sprintf("http://127.0.0.1:%d/", actual)

	fmt.Printf("\n  SectionLab · 截面几何性质  v%s\n", web.Version)
	fmt.Println("  ─────────────────────────────────────────")
	fmt.Printf("  地址   %s\n", url)
	fmt.Println("  说明   全部计算在你自己的浏览器里完成，不联网、不落盘")
	fmt.Println("  退出   关掉这个窗口，或按 Ctrl+C")
	fmt.Println()

	if !*noOpen {
		openBrowser(url)
	}

	srv := &http.Server{
		Handler:           routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fatal(err)
		}
	}()

	<-ctx.Done()
	fmt.Println("\n  已退出。")
	shutCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	srv.Shutdown(shutCtx)
}

// routes 只放行内嵌的静态资源，不做任何写操作。
func routes() http.Handler {
	files := http.FileServer(http.FS(web.FS))
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		files.ServeHTTP(w, r)
	})
	return mux
}

// listen 只绑回环地址：这是本机工具，不需要也不应该暴露到局域网。
func listen(want int) (net.Listener, int, error) {
	for i := 0; i < 20; i++ {
		p := want + i
		if p > 65535 {
			break
		}
		ln, err := net.Listen("tcp4", fmt.Sprintf("127.0.0.1:%d", p))
		if err == nil {
			return ln, p, nil
		}
	}
	return nil, 0, fmt.Errorf("端口 %d 附近都被占用了，试试 --port 9000", want)
}

func openBrowser(url string) {
	if runtime.GOOS != "windows" {
		return
	}
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	_ = cmd.Start()
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "\n  ✗ %v\n\n", err)
	os.Exit(1)
}
