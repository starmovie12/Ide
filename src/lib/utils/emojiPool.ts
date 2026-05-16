export const emojiPool = [
  "🤖", "🧠", "⚡", "🔮", "🛠️", "⚙️", "🔧", "🔬", "🔍", "🐛", 
  "🎨", "🪄", "💻", "⌨️", "🚀", "🛸", "🎯", "🎲", "🧩", "📈",
  "📊", "📊", "📋", "📁", "🗂️", "📦", "📚", "🔖", "📝", "✍️"
];

export function getRandomEmoji() {
  return emojiPool[Math.floor(Math.random() * emojiPool.length)];
}
