export interface File {
  name: string;
  content: string;
}

type LineType = { type: 'fileName'; name: string } | { type: 'content'; content: string };

export const parse = (data: string): File[] => {
  const lines = data.split('\n');

  // First pass: classify each line
  const classifiedLines: LineType[] = lines.map((line) => {
    if (line.startsWith('-- ') && line.endsWith(' --')) {
      const name = line.slice(3, -3).trim();
      return { type: 'fileName', name };
    }
    return { type: 'content', content: line };
  });

  // Second pass: reduce to files
  return classifiedLines
    .reduce((acc: File[], line) => {
      if (line.type === 'fileName') {
        acc.push({ name: line.name, content: '' });
      } else if (line.type === 'content') {
        if (acc.length > 0) {
          const lastFile = acc[acc.length - 1];
          lastFile.content += (lastFile.content === '' ? '' : '\n') + line.content;
        }
      }
      return acc;
    }, [])
    .map((file) => ({
      ...file,
      content: file.content.endsWith('\n') ? file.content.slice(0, -1) : file.content,
    }));
};
