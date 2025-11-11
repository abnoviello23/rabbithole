import modal

# Create a Modal app
# The app name should match your Modal workspace/app name
app = modal.App("main")

# Define the image with dependencies and include backend files
# Note: Run this from the backend/ directory
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements("requirements.txt")
    .add_local_dir(".", remote_path="/app")  # Adds all files in backend/ to /app in the image
)

# Create a Modal function that serves the FastAPI app
# Secrets are passed to @app.function() and will be available as environment variables
# in the function (accessible via os.environ or os.getenv())
@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("rabbithole-secrets")
    ],
    timeout=300,
)
@modal.asgi_app()
def fastapi_app():
    import sys
    import os
    sys.path.insert(0, "/app")
    
    # Set working directory to /app
    os.chdir("/app")
    
    # Import FastAPI app - it will use os.getenv() to access secrets from Modal
    from main import app as fastapi_app
    
    return fastapi_app

