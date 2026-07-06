/**
 * A robust VDF (Valve Data Format) parser.
 * Converts Steam VDF configuration files (like libraryfolders.vdf and appmanifests) into Javascript objects.
 */
export function parseVDF(text: string): any {
  const result: any = {};
  const stack: any[] = [result];
  let current = result;

  // Normalize newlines and strip single line comments
  const lines = text.split(/\r?\n/);
  const cleanLines: string[] = [];
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('//')) continue;
    cleanLines.push(line);
  }

  // Regex to match keys, values, and brackets
  // Matches: "key" "value" OR "key" OR "key" { OR }
  const regex = /"([^"]*)"(?:\s+"([^"]*)")?|({)|(})/g;

  // We re-join the lines with a space for unified tokenization
  const content = cleanLines.join(' ');
  let match;

  while ((match = regex.exec(content)) !== null) {
    const [, key, val, openBrace, closeBrace] = match;

    if (openBrace) {
      // Brace opening. The parent key was parsed just before this.
      // Handled during the key step.
    } else if (closeBrace) {
      // Pop from stack
      stack.pop();
      current = stack[stack.length - 1];
    } else if (key !== undefined) {
      if (val !== undefined) {
        // Simple key-value
        current[key] = val;
      } else {
        // Key with upcoming object (we look ahead to see if the next token is open brace,
        // but VDF standard implies it is an object)
        const nextContent = content.substring(regex.lastIndex).trim();
        if (nextContent.startsWith('{')) {
          const newObj = {};
          current[key] = newObj;
          stack.push(newObj);
          current = newObj;
        } else {
          // Key with empty value or single key
          current[key] = "";
        }
      }
    }
  }

  return result;
}
