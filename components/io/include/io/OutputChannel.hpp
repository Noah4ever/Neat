#pragma once

class OutputChannel {
  public:
    virtual void set(bool state) = 0;
    virtual ~OutputChannel() = default;
};