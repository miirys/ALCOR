def greet(name)
end

def greet2(name)
  puts name
end

greet3 = Proc.new { |name| }

greet4 = Proc.new { |name| puts name }

greet5 = lambda { |name| }

greet6 = lambda { |name| puts name }

class Greet
  def initialize(name)
  end

  def greet
  end
end

class Greet2
  def initialize(name)
    @name = name
  end

  def greet
    puts "Hello #{@name}"
  end
end

class Greet3
end

def generate_greetings
end

def greet_generator
  yield 'Hello'
end
