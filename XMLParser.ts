import {randomUUID} from "crypto"
import {readFile} from "fs/promises"
import { join } from "path";
import { argv0 } from "process";


export class Node {
    name: string;
    attrs: any;
    isSelfClosing: boolean;
    children: Node[];
    parent: Node | null;
    nextSibling: Node | null;
    prevSibling: Node | null;
    id: string;
    textContent: string;
    constructor(name: string, parent: Node | null, attrs: any = {}, isSelfClosing: boolean = false) {
        this.id = randomUUID()
        this.name = name;
        this.parent = parent;
        this.attrs = attrs;
        this.isSelfClosing = isSelfClosing;
        this.children = []
        this.nextSibling = null;
        this.prevSibling = null;
        this.textContent = ""
    }

    addChild(node: Node) {
        if (this.children.length > 0) {
            const lastChild = this.children[this.children.length - 1]
            lastChild.nextSibling = node;
            node.prevSibling = lastChild
        }
        this.children.push(node)
    }

    remove(id: string) {
        let i = 0;
        for (const ch of this.parent?.children ?? []) {
            if (ch.id === id) {
                this.parent?.children.splice(i, 1)
            }
            i += 1;
        }
    }
}

export class XMLParser {
    current: number;
    xmlString: string;
    line: number;
    constructor() {
        this.line = 1;
        this.current = 0;
        this.xmlString = ""
    }

    parse(xmlString: string) {
        this.current = 0;
        this.xmlString = xmlString;
        return this._parse()
    }

    private _parse(): Node[] {
        const nodes: Node[] = []
        const stack: Node[] = []

        while (true) {
            this.skipWhitespace()
            if (this.current >= this.xmlString.length) {
                break;
            }

            const c = this.advance()
            if (c === '<') {
                const nextC = this.peek()
                if (nextC === '/') { // Closing tag
                    this.advance() // skip the '/'
                    const tagName = this.closingTag()
                    if (stack.length === 0) {
                        console.log("ERR: ending tag found without an opening tag")
                        return []
                    }
                    const openingTag = stack[stack.length - 1].name
                    if (openingTag !== tagName) {
                        console.log("Missing closing tag for:", openingTag, "at line", this.line)
                        return []
                    }
                    stack.pop()

                } else if (nextC === '?') {
                    this.skipDeclaration()
                } else if (nextC === '!') {
                    this.skipDeclaration()
                } else { // Opening tag
                    let parent: Node | null = null;
                    if (stack.length > 0) {
                        parent = stack[stack.length - 1]
                    }
                    const node = this.tag(parent)
                    if (parent) {
                        parent.addChild(node)
                    }

                    // Push the node on to the stack so that its children can be parsed
                    if (!node.isSelfClosing) {
                        stack.push(node)
                    }

                    // Also, add the node to the 'nodes' array if it's a top level node
                    if (node.parent === null) {
                        nodes.push(node)
                    }
                }
            } else { // Text node
                console.log("Text node", this.line)
                let parent: Node | null = null;
                if (stack.length > 0) {
                    parent = stack[stack.length - 1]
                }
                const textNode = this.textNode(parent)
                if (parent) {
                    parent.addChild(textNode)
                }
            }
        }

        return nodes;
    }

    private skipWhitespace() {
        while (true) {
            const c = this.peek()
            switch (c) {
                case ' ':
                case '\r':
                case '\t':
                case '\n': {
                    this.advance()
                    break;
                }
                default: {
                    return;
                }
            }
        }
    }

    private skipDeclaration() {
        while (true) {
            const c = this.peek()
            if (c === '>') {
                this.advance()
                return;
            }
            this.advance()
        }
    }

    private peek() {
        return this.xmlString[this.current]
    }

    private advance() {
        if (this.peek() === '\n') {
            this.line += 1
        }
        this.current++;
        return this.xmlString[this.current - 1]
    }

    private textNode(parent: Node | null) {
        this.rewindTo(">") // Rewind to the '>' character in order to preserve whitespace characters
        const start = this.current
        while (true) {
            const c = this.peek()
            if (c === '<') {
                const tNode = new Node("#text", parent, {}, false)
                tNode.textContent = this.xmlString.slice(start, this.current)
                return tNode
            }
            this.advance()
        }
        
    }

    private rewindTo(ch: string) {
        while (true) {
            if (this.current === 0) {
                return;
            }
            const c = this.peek()
            if (c === ch) {
                this.advance()
                return;
            }
            this.current -= 1;
        }
    }

    private closingTag() {
        this.skipWhitespace()
        const start = this.current;
        while (true) {
            const c = this.peek()
            if (c === '>') {
                this.advance() // skip the ending '>'
                return this.xmlString.slice(start, this.current - 1)
            }
            this.advance()
        }
    }

    private tag(parent: Node | null) {
        const name = this.nodeName()
        let isSelfClosing = false;
        const attrs = this.attrs()

        const closerCh = this.advance()
        if (closerCh === '/') { // self closing tag
            isSelfClosing = true;
            this.advance()
            this.advance()
        } else if (closerCh === '>') {
            this.advance()
        } else {
            console.log("ERR: Invalid closing character")
        }

        return new Node(
            name,
            parent,
            attrs,
            isSelfClosing
        )
    }

    private nodeName() {
        this.skipWhitespace()
        const start = this.current;

        const breakChars = [' ', '\n', '\r', '\t', '>', '/']

        while (true) {
            const c = this.peek()
            if (breakChars.includes(c)) {
                break;
            }
            this.advance()
        }

        return this.xmlString.slice(start, this.current)
    }

    private attrs(prevAttrs: any = {}): any {
        this.skipWhitespace()
        const c = this.peek()
        if (c === '/' || c === '>') { // end of attrs
            return prevAttrs;
        }

        let key = ""
        const breakChars = [' ', '\r', '\n', '\t']
        const keyStart = this.current
        while (true) { // This loop parses the key
            const c = this.peek()
            if (breakChars.includes(c)) { // boolean attribute
                key = this.xmlString.slice(keyStart, this.current)
                return this.attrs({
                    ...prevAttrs,
                    [key]: "true"
                })
            } else if (c === '=') { // Attribute with value
                key = this.xmlString.slice(keyStart, this.current)
                break;
            } else {
                this.advance()
            }
        }
        
        this.skipWhitespace()
        this.advance() // skip the '='
        const openingChar = this.advance() // skip the opening char '"' OR "'"
        let value = ""
        const valueStart = this.current
        while (true) { // this loop parses the value
            const c = this.peek()
            if (c === openingChar && this.xmlString[this.current - 1].charCodeAt(0) !== 92) {
                // Check for ending '"', ignore '"' if preceeded by '\' as that means that it has been escaped
                value = this.xmlString.slice(valueStart, this.current)
                this.advance() // skip the ending '"' Or "'"
                break;
            } else {
                this.advance()
            }
        }
        this.skipWhitespace()

        return this.attrs({
            ...prevAttrs,
            [key]: value
        })
    }

    static findNode(node: Node, predicate: (node: Node) => boolean): Node[] {
        let matches: Node[] = [];

        function traverse(node: Node) {
            if (predicate(node)) {
                matches.push(node);
            }

            for (const child of node.children) {
                traverse(child);
            }
        }

        traverse(node);
        return matches;
    }

}

const main = async () => {
    const args = process.argv
    if (args.length !== 3) {
        console.log("Invalid number of arguments")
        return;
    }
    const fileName = args[2]
    const filePath = join(process.cwd(), fileName)
    let xmlString = await readFile(filePath, {encoding:"utf-8"})
    const parser = new XMLParser()
    const tree = parser.parse(xmlString)
    const root = tree[0]
    console.log(root.children[0].children[0].nextSibling)
}

main()
