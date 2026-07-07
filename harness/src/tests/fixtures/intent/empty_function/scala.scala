def greet(name: String): Unit = {

}

def greet(name: String): Unit = {
  println(name)
}

// Define a type alias for the function
type GreetFunction = String => Unit

// Function instances
val greet: GreetFunction = (name: String) => {

}

val greetWithContent: GreetFunction = (name: String) => {
  println(s"Hello $name")
}

// Empty class
class EmptyGreet {

}

// Class with a method
class Greet {
  def greet(): Unit = {

  }
}

// Class with constructor and method with content
class GreetWithContent(private val name: String) {
  def greet(): Unit = {
    println(s"Hello $name")
  }
}

