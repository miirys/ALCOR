fn greet(name: &str) { }

fn greet(name: &str) {
    println!("{}", name);
}

struct Greet;

impl Greet { }

impl Greet {
    fn new(name: String) -> Self {

    }

    fn greet(&self, name: &str) {

    }
}

impl Greet {
    fn new(name: String) -> Self {
        Self { name }
    }

    fn greet(&self, name: &str) {
        println!("{}", name);
    }
}

let greet = |name: &str| -> String {

};

let greet = |name| {
    println!("Hello, {}!", name);
};

@empty_function
  (#match? @empty_body "^\\s*\\{\\s*\\}\\s*$")

macro_rules! empty_macro {
    () => {};
}

macro_rules! non_empty_macro {
    () => {
        println!("This macro is not empty");
    };
}

macro_rules! define_empty_function {
    ($fn_name:ident) => {
        fn $fn_name() {

        }
    };
}

macro_rules! define_non_empty_function {
    ($fn_name:ident) => {
        fn $fn_name() {
          println!("This macro is not empty");
        }
    };
}
