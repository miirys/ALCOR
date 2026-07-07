void greet(const std::string& name) {}

void greet2(const std::string& name) {
    std::cout << name << std::endl;
}

auto greet3 = [](const std::string& name) {};

// Lambda function that prints the name
auto greet4 = [](const std::string& name) {
    std::cout << name << std::endl;
};

class Greet {
public:
    Greet(const std::string& name) { }

    void greet() { }
};

// Class with constructor and member function
class Greet2 {
private:
    std::string name;

public:
      Greet2(const std::string& name) : name(name) {
            std::cout << "Name initialized to: " << name << std::endl;
      }

    void greet() {
        std::cout << "Hello " << name << std::endl;
    }
};

class Greet3 { };
