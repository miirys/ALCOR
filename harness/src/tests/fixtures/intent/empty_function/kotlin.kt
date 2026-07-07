fun greet(name: String) {}

fun greet2(name: String) {
    println(name)
}

val greet3: (String) -> Unit = {}

val greet4: (String) -> Unit = { name ->
    println(name)
}

class Greet { }

class Greet {
  val name: String

  constructor(name: String) {
    /*TODO: secondary_constructor node does not have the body node and thus
    it is impossible to identify whether the cusrsor is inside the empty fn body*/

  }

  fun greet() {

  }

  fun greet2() {
      println("Hello, $name")
  }
}
