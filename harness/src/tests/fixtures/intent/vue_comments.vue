<template>
  <!-- Empty comment -->
  <!---->

  <!-- Non-empty comment -->
  <!-- This is a non-empty comment -->

  <!--
  This is a block comment
  It spans multiple lines
  -->

  <div>{{ greeting }}</div>
</template>

<script>
// Empty comment
//

// Non-empty comment
// This is a non-empty comment

/*
This is a block comment
It spans multiple lines
*/

export default {
  data() {
    return {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6
    }
  },
  computed: {
    greeting() {
      return `Hello, ${this.name}!`
    },

    helloUser() {
      //  function to say hello to the user

    }
  }
}
</script>
