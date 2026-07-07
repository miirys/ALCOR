func greet(name string) {}

func greet(name string) {
    fmt.Println(name)
}

var greet = func(name string) { }

var greet = func(name string) {
    fmt.Println(name)
}

type Greet struct{}

type Greet struct {
    name string
}

// empty method declaration
func (g Greet) greet() { }

// non-empty method declaration
func (g Greet) greet() {
    fmt.Printf("Hello %s\n", g.name)
}
