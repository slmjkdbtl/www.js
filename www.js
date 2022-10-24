// helpers for the world wide web
// TODO: async fs

import http from "http"
import fs from "fs"
import url from "url"
import path from "path"

const nl = process.env.NODE_ENV === "development" ? "\n" : ""

// html builder
function tag(tagname, attrs, children) {

	let html = `<${tagname}`

	for (const k in attrs) {
		let v = attrs[k]
		switch (typeof(v)) {
			case "boolean":
				if (v === true) {
					html += ` ${k}`
				}
				break
			case "string":
				if (typeof(v) === "string") {
					v = `"${v}"`
				}
			case "number":
				html += ` ${k}=${v}`
				break
		}
	}

	html += ">"

	if (typeof(children) === "string" || typeof(children) === "number") {
		html += children
	} else if (Array.isArray(children)) {
		for (const child of children) {
			if (!child) {
				continue
			}
			if (Array.isArray(child)) {
				html += tag("div", {}, child)
			} else {
				html += child
			}
		}
	}

	if (children !== undefined && children !== null) {
		html += `</${tagname}>` + nl
	}

	return html

}

const camelToKababCase = (str) =>
	str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

// TODO: @font-face
// sass-like css preprocessor
function style(list) {

	let text = ""

	function handleSheet(s) {
		let t = "{" + nl
		for (const k in s) {
			t += camelToKababCase(k) + ":" + s[k] + ";" + nl
		}
		t += "}" + nl
		return t
	}

	function handleSheetEx(sel, sheet) {
		let t = sel + " {" + nl
		let post = ""
		for (const key in sheet) {
			const val = sheet[key]
			// media
			if (key === "@media") {
				for (const cond in val) {
					post += "@media " + cond + "{" + nl + sel + handleSheet(val[cond]) + "}" + nl
				}
			// pseudo class
			} else if (key[0] === ":") {
				post += handleSheetEx(sel + key, val)
			// self
			} else if (key[0] === "&") {
				post += handleSheetEx(sel + key.substring(1), val)
			// nesting child
			} else if (typeof(val) === "object") {
				post += handleSheetEx(sel + " " + key, val)
			} else {
				t += camelToKababCase(key) + ":" + val + ";" + nl
			}
		}
		t += "}" + nl + post
		return t
	}

	for (const sel in list) {
		const sheet = list[sel]
		if (sel === "@keyframes") {
			for (const name in sheet) {
				const map = sheet[name]
				text += "@keyframes " + name + "{" + nl
				for (const time in map) {
					text += time + handleSheet(map[time])
				}
				text += "}" + nl
			}
		} else {
			text += handleSheetEx(sel, sheet)
		}
	}

	return text

}

const mimes = {
	"html": "text/html",
	"css": "text/css",
	"js": "text/javascript",
	"mjs": "text/javascript",
	"cjs": "text/javascript",
	"json": "application/json",
	"png": "image/png",
	"jpg": "image/jpeg",
	"jpeg": "image/jpeg",
	"gif": "image/gif",
	"svg": "image/svg+xml",
	"mp4": "video/mp4",
	"ogg": "audio/ogg",
	"wav": "audio/wav",
	"mp3": "audio/mpeg",
	"aac": "audio/aac",
	"otf": "font/otf",
	"ttf": "font/ttf",
	"woff": "text/woff",
	"woff2": "text/woff2",
	"txt": "text/plain",
	"zip": "application/zip",
	"pdf": "application/pdf",
}

function makeServer() {

	const handlers = []

	let onError = (req, res, e) => {
		res.status(500)
		console.error(e)
	}

	let onNotFound = (req, res) => {
		res.status(404)
		res.text("not found")
	}

	return {

		error(f) {
			onError = f
		},

		notfound(f) {
			onNotFound = f
		},

		handle(cb) {
			handlers.push(cb)
		},

		match(pat, cb) {
			this.handle((req, res) => {
				const match = matchUrl(pat, req.path)
				if (match) {
					cb({
						...req,
						params: match,
					}, res)
				}
			})
		},

		get(pat, cb) {
			this.handle((req, res) => {
				if (req.method !== "GET") return
				const match = matchUrl(pat, req.path)
				if (match) {
					cb({
						...req,
						params: match,
					}, res)
				}
			})
		},

		post(pat, cb) {
			this.handle((req, res) => {
				if (req.method !== "POST") return
				const match = matchUrl(pat, req.path)
				if (match) {
					cb({
						...req,
						params: match,
					}, res)
				}
			})
		},

		files(route, root) {
			this.handle((req, res) => {
				if (!req.path.startsWith(route)) {
					return
				}
				let p = root || "."
				const child = req.path.replace(new RegExp(`^${route}`), "")
				if (child) {
					p += child
				}
				if (!fs.existsSync(p)) {
					return
				}
				const stat = fs.statSync(p)
				if (stat.isDirectory()) {
					if (req.query.fmt === "json") {
						res.dirjson(p)
					} else {
						res.dir(p)
					}
				} else {
					res.file(p)
				}
			})
		},

		start(port) {

			const server = http.createServer((req, res) => {

				// TODO: url.parse is deprecated
				const requrl = url.parse(req.url, true)

				const req2 = {
					headers: req.headers,
					url: req.url,
					method: req.method,
					path: requrl.pathname,
					query: requrl.query,
				}

				let status = 200
				let headers = {}
				let body = null

				function send() {
					for (const k in headers) {
						res.setHeader(k, headers[k])
					}
					res.writeHead(status)
					res.end(body)
				}

				const res2 = {

					header(k, v) {
						headers[k] = v
					},

					cors() {
						this.header("Access-Control-Allow-Origin", "*")
					},

					status(code) {
						status = code
					},

					text(txt) {
						this.header("Content-Type", "text/plain")
						this.status(status || 200)
						body = txt
						send()
					},

					html(code) {
						this.header("Content-Type", "text/html; charset=utf-8")
						this.status(status || 200)
						body = code
						send()
					},

					json(data) {
						this.header("Content-Type", "application/json")
						this.status(status || 200)
						body = JSON.stringify(data)
						send()
					},

					raw(data) {
						this.status(status || 200)
						body = data
						send()
					},

					redirect(to) {
						this.header("Location", to)
						this.status(307)
						send()
					},

					file(p) {

						if (!fs.existsSync(p)) {
							return
						}

						const ext = path.extname(p).substring(1)
						const mime = mimes[ext]

						if (mime) {
							this.header("Content-Type", mime)
						}

						this.cors()
						this.raw(fs.readFileSync(p))

					},

					dir(p) {

						if (!fs.existsSync(p)) {
							return
						}

						const entries = fs
							.readdirSync(p)
							.filter(p => !p.startsWith("."))

						const parent = req2.path === "/" ? "" : req2.path

						const page = entries
							.map((e) => {
								const stat = fs.statSync(`${p}/${e}`)
								const name = e + (stat.isDirectory() ? "/" : "")
								return tag("a", {
									href: `${parent}/${e}`,
								}, name) + tag("br")
							})
							.join("")

						this.html(page)

					},

					dirjson(p) {

						if (!fs.existsSync(p)) {
							return
						}

						const entries = fs
							.readdirSync(p)
							.filter(p => !p.startsWith("."))

						this.json(entries)

					},

				}

				for (const onRequest of handlers) {

					try {
						onRequest(req2, res2)
					} catch (e) {
						onError(req2, res2, e)
					}

					if (res.finished) {
						return
					}

				}

				if (!res.finished) {
					onNotFound(req2, res2)
				}

			})

			server.listen(port)

			return server

		},

	}

}

function matchUrl(pat, url) {

	pat = pat.replace(/\/$/, "")
	url = url.replace(/\/$/, "")

	if (pat === url) {
		return {}
	}

	const vars = pat.match(/:[^\/]+/g) || []
	let regStr = pat

	for (const v of vars) {
		const name = v.substring(1)
		regStr = regStr.replace(v, `(?<${name}>[^\/]+)`)
	}

	regStr = "^" + regStr + "$"

	const reg = new RegExp(regStr)
	const matches = reg.exec(url)

	if (matches) {
		return { ...matches.groups }
	} else {
		return null
	}

}

function escapeHTML(unsafe) {
	return unsafe
		.replace(/&/g, "&amp")
		.replace(/</g, "&lt")
		.replace(/>/g, "&gt")
		.replace(/"/g, "&quot")
		.replace(/'/g, "&#039")
}

export {
	tag,
	style,
	makeServer,
	escapeHTML,
}
