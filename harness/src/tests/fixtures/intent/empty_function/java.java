void greet(String name) { }

void greet(String name) {
    System.out.println(name);
}

GreetFunction greet = (String name) -> {

};

GreetFunction greetWithContent = (String name) -> {
    System.out.println("Hello " + name);
}

// empty class
class EmptyGreet { }

class Greet {
    Greet() { }

    void greet() { }
}

// Class with a constructor and a method with content
class GreetWithContent {
    private String name;

    GreetWithContent(String name) {
        this.name = name;
    }

    void greet() {
        System.out.println("Hello " + name);
    }
}
