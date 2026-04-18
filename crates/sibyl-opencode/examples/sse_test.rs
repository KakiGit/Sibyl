use futures::StreamExt;
use sibyl_opencode::sse::SseClient;

#[tokio::main]
async fn main() {
    let url = "http://localhost:4096/global/event";
    println!("Testing SSE connection to {}", url);

    let sse = SseClient::new(url);
    match sse.connect().await {
        Ok(stream) => {
            println!("SSE connected successfully!");
            let mut stream = stream;
            for i in 0..5 {
                match stream.next().await {
                    Some(Ok(event)) => {
                        println!("Received event {}: {:?}", i, event);
                    }
                    Some(Err(e)) => {
                        println!("Event error: {:?}", e);
                    }
                    None => {
                        println!("Stream ended");
                        break;
                    }
                }
            }
        }
        Err(e) => {
            println!("SSE connection failed: {:?}", e);
        }
    }
}
