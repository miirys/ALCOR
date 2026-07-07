<template>
  <div>{{ greeting }}</div>
</template>

<script>
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
  constructor(name) {
    this.name = name;
  }

  greet() {
    console.log(`Hello ${this.name}`);
  }
}

class Greet3 {}

function* generateGreetings() {}

function* greetGenerator() {
  yield 'Hello';
}

export default {
  methods: {
    greet() {

    }
  }
}
</script>
