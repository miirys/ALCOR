import { sha256 } from 'js-sha256';

// prettier-ignore
const adjectives: string[] = [
  "adorable", "adventurous", "amazing", "amiable", "amusing",
  "artistic", "astounding", "awesome", "balanced", "beaming",
  "beautiful", "blissful", "bold", "brave", "bright",
  "brilliant", "bubbly", "calm", "charming", "cheerful",
  "clear", "clever", "colorful", "comfortable", "compassionate",
  "confident", "courageous", "creative", "curious", "dapper",
  "dazzling", "delightful", "determined", "diligent", "dynamic",
  "eager", "elegant", "enchanting", "energetic", "enthusiastic",
  "excellent", "excited", "extraordinary", "fabulous", "fair",
  "faithful", "fantastic", "favorable", "fearless", "friendly",
  "funny", "generous", "gentle", "glorious", "good",
  "graceful", "gracious", "grand", "grateful", "great",
  "happy", "harmonious", "helpful", "hilarious", "honest",
  "honorable", "hopeful", "humorous", "imaginative", "incredible",
  "inspiring", "intelligent", "interesting", "inventive", "jolly",
  "joyful", "jubilant", "kind", "knowledgeable", "legendary",
  "lively", "lovely", "lucky", "luminous", "magnificent",
  "marvelous", "masterful", "miraculous", "motivated", "merry",
];

// prettier-ignore
const animals: string[] = [
  "alligator", "alpaca", "antelope", "badger", "bat",
  "bear", "beaver", "bee", "bison", "butterfly",
  "camel", "cat", "cheetah", "chicken", "chinchilla",
  "chipmunk", "cow", "coyote", "crab", "crane",
  "cricket", "crocodile", "crow", "deer", "dinosaur",
  "dog", "dolphin", "dove", "duck", "eagle",
  "elephant", "elk", "falcon", "ferret", "finch",
  "fish", "flamingo", "fox", "frog", "gazelle",
  "giraffe", "goat", "goose", "gorilla", "hamster",
  "hawk", "hedgehog", "heron", "hippo", "horse",
  "hummingbird", "hyena", "ibis", "iguana", "jaguar",
  "jellyfish", "kangaroo", "koala", "ladybug", "lemur",
  "leopard", "lion", "llama", "lobster", "lynx",
  "meerkat", "mongoose", "monkey", "moose", "mouse",
  "narwhal", "octopus", "otter", "owl", "panda",
  "panther", "parrot", "peacock", "penguin", "platypus",
  "porcupine", "porpoise", "rabbit", "raccoon", "rhino",
  "robin", "salmon", "seahorse", "seal", "shark",
  "sheep", "sloth", "squirrel", "tiger", "turtle",
];

/**
 * Generates an adjective-animal combination based on the input string
 * Uses SHA256, you can use it to log secrets.
 *
 * It's not meant as a replacement of the token.
 */
function friendlyHash(input: string): string {
  const sha256Hash = sha256.create().update(input).hex();

  // Use first 8 characters (4 bytes) of the hash for adjective index
  const adjectiveValue = parseInt(sha256Hash.substring(0, 8), 16);
  const adjectiveIndex = adjectiveValue % adjectives.length;

  // Use next 8 characters of the hash for animal index to ensure independence
  const animalValue = parseInt(sha256Hash.substring(8, 16), 16);
  const animalIndex = animalValue % animals.length;

  return `${adjectives[adjectiveIndex]}-${animals[animalIndex]}`;
}

export function friendlyTokenHashOnlyForLogging(token: string) {
  const splitToken = token.split('-');
  const withoutPrefix = splitToken[splitToken.length - 1];
  return friendlyHash(withoutPrefix);
}
