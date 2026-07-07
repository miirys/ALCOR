public class Greet
{
	 public Action<string> GreetUser = (name) => { };

    public Greet(string name) { }

    public void GreetMethod() { }
}

public class Greet2
{
    private string _name;

    public Greet2(string name)
    {
        _name = name;
    }

    public void GreetMethod()
    {
        Console.WriteLine($"Hello {_name}");
    }
}

public class Greet3 { }
