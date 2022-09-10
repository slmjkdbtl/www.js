import {
	makeServer,
	tag as t,
} from "./www.js"

const server = makeServer()

server.onMatch("/", (req, res) => {
	res.html(t("h1", {}, "oh hi"))
})

server.onError((req, res) => {
	res.text("oh no")
})

server.serveFiles("/files", ".")

server.start(8000)
