import { useEffect, useRef, useState } from "react";
import { Bot, Send, X, RotateCcw } from "lucide-react";
import api from "../api/client";
import { useAnalytics } from "../hooks/useAnalytics";

const SUGGESTED_QUESTIONS = [
  "What vegetarian dishes do you have?",
  "What's spicy?",
  "What can I get under ₹300?",
  "Which dish do you recommend?",
];

function AIAssistant({ qrToken, branchId = null, tableId = null }) {
  const [isOpen, setIsOpen] = useState(false);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hi! 👋 I can help you choose something from the menu.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const { track } = useAnalytics(branchId, tableId, qrToken);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  async function sendMessage(event, suggestedMessage = null) {
    event?.preventDefault();

    const message = (suggestedMessage ?? input).trim();

    if (!message || loading || !qrToken) {
      return;
    }

    track({
      eventType: "AI_QUESTION",
      metadata: {
        source: "ai_assistant",
        question_length: message.length,
      },
    });

    const history = messages.slice(-10).map((item) => ({
      role: item.role,
      text: item.text,
    }));

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        text: message,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const response = await api.post(
        `/public/ai/chat/${encodeURIComponent(qrToken)}`,
        {
          message,
          history,
        },
      );

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: response.data.answer,
        },
      ]);
    } catch (error) {
      const statusCode = error.response?.status;

      let errorMessage = "Sorry, I couldn't process that. Please try again.";

      if (statusCode === 429) {
        errorMessage =
          "You're sending messages too quickly. Please wait a moment and try again.";
      } else if (statusCode === 404) {
        errorMessage = "This menu is currently unavailable.";
      } else if (error.response?.data?.detail) {
        const detail = error.response.data.detail;

        errorMessage =
          typeof detail === "string"
            ? detail
            : "Sorry, I couldn't process that. Please try again.";
      }

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }

  function resetConversation() {
    if (loading) {
      return;
    }

    setMessages([
      {
        role: "assistant",
        text: "Hi! 👋 I can help you choose something from the menu.",
      },
    ]);

    setInput("");

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }

  function handleSuggestedQuestion(question) {
    sendMessage(null, question);
  }

  return (
    <>
      {!isOpen && (
        <button
          className="ai-assistant-button"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI assistant"
        >
          <Bot size={22} />
          <span>Ask AI</span>
        </button>
      )}

      {isOpen && (
        <div className="ai-assistant">
          <div className="ai-header">
            <div className="ai-title">
              <div className="ai-icon">
                <Bot size={20} />
              </div>

              <div>
                <strong>Menu Assistant</strong>
                <span>Ask about our dishes</span>
              </div>
            </div>

            <div className="ai-header-actions">
              <button
                className="ai-close"
                onClick={resetConversation}
                disabled={loading}
                aria-label="Start new conversation"
                title="New conversation"
              >
                <RotateCcw size={17} />
              </button>

              <button
                className="ai-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close AI assistant"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="ai-messages">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ai-message user"
                    : "ai-message assistant"
                }
              >
                {message.text}
              </div>
            ))}

            {messages.length === 1 && !loading && (
              <div className="ai-suggestions">
                <span>Try asking:</span>

                {SUGGESTED_QUESTIONS.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => handleSuggestedQuestion(question)}
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="ai-message assistant ai-thinking">
                <span className="ai-dot" />
                <span className="ai-dot" />
                <span className="ai-dot" />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="ai-input-area" onSubmit={sendMessage}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about the menu..."
              maxLength={500}
              disabled={loading}
              aria-label="Ask the menu assistant"
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>

          <div className="ai-character-count">{input.length}/500</div>
        </div>
      )}
    </>
  );
}

export default AIAssistant;
