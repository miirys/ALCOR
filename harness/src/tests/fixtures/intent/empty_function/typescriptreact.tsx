function greet(name) {}

function greet2(name) {
  console.log(name);
}

const greet3 = function (name) {};

const greet4 = function (name) {
  console.log(name);
};

const greet5 = (name) => {};

const greet6 = (name) => {
  console.log(name);
};

class Greet {
  constructor(name) {}

  greet() {}
}

class Greet2 {
  name: string;

  constructor(name) {
    this.name = name;
  }

  greet() {
    console.log(`Hello ${this.name}`);
  }
}

class Greet3 { }

const GreetComponent: React.FC<{name: string}> = ({name}) => { };

const GreetComponent2: React.FC<{name: string}> = ({name}) => {
  const greet = () => {};

  const greetWithLog = () => {
    console.log(name);
  };
  return (
    <div>
      <button onClick={greet}>Greet</button>
      <button onClick={greetWithLog}>Greet with Log</button>
    </div>
  );
};

function *generateGreetings(){ }

function* greetGenerator() {
  yield 'Hello';
}
